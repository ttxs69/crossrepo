/**
 * @fileoverview Synchronization manager
 * @module crossrepo/core/SyncManager
 */

import { GitManager } from './GitManager';
import { AIResolver } from './AIResolver';
import { ConfigManager } from './ConfigManager';
import {
  ProjectConfig,
  SyncStatus,
  SyncOptions,
  ConflictInfo,
  AIResolutionRequest,
} from '../types';

export interface SyncProgress {
  total: number;
  completed: number;
  failed: number;
  conflicts: number;
  current?: {
    repo: string;
    branch: string;
    commit: string;
  };
}

export interface SyncState {
  /** Repo name */
  repo: string;
  /** Branch name */
  branch: string;
  /** Stash reference if changes were stashed */
  stashRef?: string;
  /** Original branch before sync */
  originalBranch?: string;
}

export type ProgressCallback = (progress: SyncProgress, status: SyncStatus) => void;

export class SyncManager {
  private config: ProjectConfig;
  private configManager: ConfigManager;
  private gitManagers: Map<string, GitManager> = new Map();
  private aiResolver: AIResolver | null = null;
  private progressCallback?: ProgressCallback;
  /** Track stashes for restoration */
  private stashes: Map<string, string> = new Map();

  constructor(config: ProjectConfig, configManager: ConfigManager) {
    this.config = config;
    this.configManager = configManager;
    this.initGitManagers();

    if (config.ai) {
      this.aiResolver = new AIResolver(config.ai);
    }
  }

  private initGitManagers(): void {
    for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
      const gitManager = new GitManager(repoConfig.path);
      this.gitManagers.set(repoName, gitManager);
    }
  }

  /**
   * Set progress callback
   */
  onProgress(callback: ProgressCallback): void {
    this.progressCallback = callback;
  }

  /**
   * Sync all repos and branches
   */
  async sync(options: SyncOptions): Promise<SyncStatus[]> {
    const results: SyncStatus[] = [];
    const progress: SyncProgress = {
      total: this.calculateTotal(),
      completed: 0,
      failed: 0,
      conflicts: 0,
    };

    // Track state for rollback/cleanup
    const syncStates: SyncState[] = [];

    try {
      for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
        const gitManager = this.gitManagers.get(repoName);
        if (!gitManager) continue;

        // Save original state
        const originalBranch = await gitManager.getCurrentBranch();
        
        // Stash if needed
        if (await gitManager.hasUncommittedChanges()) {
          const stashRef = `crossrepo-${Date.now()}`;
          const stashResult = await gitManager.stash(stashRef);
          if (stashResult.success) {
            this.stashes.set(repoName, stashRef);
            syncStates.push({ repo: repoName, branch: originalBranch, stashRef, originalBranch });
          } else {
            // Failed to stash, abort
            results.push({
              repo: repoName,
              branch: originalBranch,
              commit: '',
              status: 'failed',
              error: 'Failed to stash uncommitted changes. Please commit or stash manually.',
            });
            continue;
          }
        } else {
          syncStates.push({ repo: repoName, branch: originalBranch, originalBranch });
        }

        for (const branch of repoConfig.targetBranches) {
          for (const commit of repoConfig.commits) {
            progress.current = { repo: repoName, branch, commit };
            
            const status = await this.syncCommit(
              gitManager,
              repoName,
              branch,
              commit,
              options
            );

            results.push(status);

            if (status.status === 'success') {
              progress.completed++;
            } else if (status.status === 'conflict') {
              progress.conflicts++;
              if (!options.continueOnError) {
                // Cleanup and stop
                await this.cleanup(syncStates);
                return results;
              }
            } else if (status.status === 'failed') {
              progress.failed++;
              if (!options.continueOnError) {
                // Cleanup and stop
                await this.cleanup(syncStates);
                return results;
              }
            }

            this.progressCallback?.(progress, status);
          }
        }
      }
    } finally {
      // Always try to restore stashed changes
      await this.cleanup(syncStates);
    }

    return results;
  }

  /**
   * Cleanup and restore state after sync
   */
  private async cleanup(states: SyncState[]): Promise<void> {
    for (const state of states) {
      const gitManager = this.gitManagers.get(state.repo);
      if (!gitManager) continue;

      // Restore original branch if different
      if (state.originalBranch) {
        const currentBranch = await gitManager.getCurrentBranch();
        if (currentBranch !== state.originalBranch) {
          try {
            await gitManager.checkout(state.originalBranch);
          } catch {
            // Ignore checkout errors during cleanup
          }
        }
      }

      // Pop stash if we stashed
      if (state.stashRef) {
        try {
          await gitManager.stashPop();
          this.stashes.delete(state.repo);
        } catch {
          // Stash pop may fail if conflicts, that's OK
        }
      }
    }
  }

  private async syncCommit(
    gitManager: GitManager,
    repoName: string,
    targetBranch: string,
    commitHash: string,
    options: SyncOptions
  ): Promise<SyncStatus> {
    const status: SyncStatus = {
      repo: repoName,
      branch: targetBranch,
      commit: commitHash,
      status: 'pending',
    };

    try {
      // Verify commit exists
      const commitInfo = await gitManager.getCommitInfo(commitHash);
      if (!commitInfo) {
        status.status = 'failed';
        status.error = `Commit ${commitHash} not found in repository`;
        return status;
      }

      // Checkout target branch
      const branchExists = await gitManager.branchExists(targetBranch);
      if (!branchExists && !options.createBranch) {
        status.status = 'failed';
        status.error = `Branch ${targetBranch} does not exist. Use --create-branch to create it.`;
        return status;
      }

      if (!branchExists) {
        // Create branch from current HEAD
        await gitManager.createBranch(targetBranch);
      } else {
        await gitManager.checkout(targetBranch);
      }

      status.status = 'syncing';

      // Cherry-pick
      const result = await gitManager.cherryPick(commitHash, true);

      if (result.success) {
        // Commit the changes
        await gitManager.commit(`[crossrepo] ${commitInfo.message || commitHash}`);

        if (options.push) {
          await gitManager.push(targetBranch);
        }

        status.status = 'success';
      } else if (result.conflicts) {
        status.conflict = result.conflicts;
        status.status = 'conflict';

        // Try AI resolution
        if (options.autoResolve && this.aiResolver) {
          const resolved = await this.resolveConflicts(gitManager, result.conflicts, commitHash);
          if (resolved) {
            // Push if requested after AI resolution
            if (options.push) {
              await gitManager.push(targetBranch);
            }
            status.status = 'resolved';
            status.resolution = 'AI resolved conflicts';
          }
        }
      } else {
        status.status = 'failed';
        status.error = result.error;
      }
    } catch (error) {
      status.status = 'failed';
      status.error = String(error);
    }

    return status;
  }

  private async resolveConflicts(
    gitManager: GitManager,
    conflictInfo: ConflictInfo,
    commitHash: string
  ): Promise<boolean> {
    if (!this.aiResolver) return false;

    try {
      // Abort the cherry-pick first - we'll resolve manually and commit
      await gitManager.abortCherryPick();

      // Re-apply the commit with --no-commit to get the changes
      const cherryResult = await gitManager.cherryPick(commitHash, true);
      
      // Collect files that were skipped due to low confidence
      const skippedFiles: string[] = [];
      
      // If still conflicts, resolve them
      if (!cherryResult.success && cherryResult.conflicts) {
        for (const filePath of conflictInfo.files) {
          const markers = await gitManager.getConflictMarkers(filePath);
          if (!markers) continue;

          const request: AIResolutionRequest = {
            filePath,
            ours: markers.ours,
            theirs: markers.theirs,
            base: markers.base,
            commitMessage: commitHash,
          };

          const resolution = await this.aiResolver.resolveConflict(request);
          
          // Check confidence - if low, we should not auto-apply
          if (resolution.confidence === 'low') {
            console.warn(`Low confidence resolution for ${filePath}, skipping auto-apply`);
            skippedFiles.push(filePath);
            continue;
          }
          
          await gitManager.resolveFile(filePath, resolution.content);
        }
      }

      // If some files were skipped, we can't complete the resolution
      if (skippedFiles.length > 0) {
        console.error(`Skipped ${skippedFiles.length} files due to low confidence: ${skippedFiles.join(', ')}`);
        await gitManager.abortCherryPick();
        return false;
      }

      // Check if there are any staged changes after resolution
      const hasStaged = await gitManager.hasStagedChanges();
      if (hasStaged) {
        const commitInfo = await gitManager.getCommitInfo(commitHash);
        const commitResult = await gitManager.commit(
          `[crossrepo] ${commitInfo?.message || commitHash}`
        );
        return commitResult.success;
      }
      
      // No changes after resolution - that's still success (empty commit)
      return true;
    } catch (error) {
      console.error(`Failed to resolve conflicts: ${error}`);
      // Make sure we're not in a bad state
      try {
        await gitManager.abortCherryPick();
      } catch {
        // Ignore
      }
      return false;
    }
  }

  private calculateTotal(): number {
    let total = 0;
    for (const repoConfig of Object.values(this.config.repos)) {
      total += repoConfig.commits.length * repoConfig.targetBranches.length;
    }
    return total;
  }

  /**
   * Preview sync (dry run)
   */
  async preview(): Promise<{
    repos: Array<{
      name: string;
      commits: string[];
      branches: string[];
      total: number;
    }>;
    total: number;
    warnings: string[];
  }> {
    const repos = [];
    let total = 0;
    const warnings: string[] = [];

    for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
      const gitManager = this.gitManagers.get(repoName);
      
      // Verify commits exist
      if (gitManager) {
        for (const commit of repoConfig.commits) {
          const exists = await gitManager.getCommitInfo(commit);
          if (!exists) {
            warnings.push(`Commit ${commit} not found in ${repoName}`);
          }
        }
      }

      const repoTotal = repoConfig.commits.length * repoConfig.targetBranches.length;
      total += repoTotal;

      repos.push({
        name: repoName,
        commits: repoConfig.commits,
        branches: repoConfig.targetBranches,
        total: repoTotal,
      });
    }

    return { repos, total, warnings };
  }

  /**
   * Get current status of all repos
   */
  async status(): Promise<Array<{
    repo: string;
    branch: string;
    hasChanges: boolean;
    conflicts: string[];
  }>> {
    const results = [];

    for (const [repoName, gitManager] of this.gitManagers) {
      const branch = await gitManager.getCurrentBranch();
      const hasChanges = await gitManager.hasUncommittedChanges();
      
      let conflicts: string[] = [];
      try {
        const conflictInfo = await gitManager.getConflicts();
        conflicts = conflictInfo.files;
      } catch {
        // No conflicts
      }

      results.push({
        repo: repoName,
        branch,
        hasChanges,
        conflicts,
      });
    }

    return results;
  }

  /**
   * Test AI connection
   */
  async testAI(): Promise<boolean> {
    if (!this.aiResolver) {
      return false;
    }
    return this.aiResolver.testConnection();
  }

  /**
   * Get repo git manager
   */
  getGitManager(repoName: string): GitManager | undefined {
    return this.gitManagers.get(repoName);
  }
}