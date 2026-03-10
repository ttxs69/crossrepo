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

export type ProgressCallback = (progress: SyncProgress, status: SyncStatus) => void;

export class SyncManager {
  private config: ProjectConfig;
  private configManager: ConfigManager;
  private gitManagers: Map<string, GitManager> = new Map();
  private aiResolver: AIResolver | null = null;
  private progressCallback?: ProgressCallback;

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

    for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
      const gitManager = this.gitManagers.get(repoName);
      if (!gitManager) continue;

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
              break;
            }
          } else if (status.status === 'failed') {
            progress.failed++;
            if (!options.continueOnError) {
              break;
            }
          }

          this.progressCallback?.(progress, status);
        }
      }
    }

    return results;
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
      // Check for uncommitted changes
      if (await gitManager.hasUncommittedChanges()) {
        await gitManager.stash(`crossrepo-auto-stash-${Date.now()}`);
      }

      // Checkout target branch
      const branchExists = await gitManager.branchExists(targetBranch);
      if (!branchExists && !options.createBranch) {
        status.status = 'failed';
        status.error = `Branch ${targetBranch} does not exist`;
        return status;
      }

      if (!branchExists) {
        await gitManager.createBranch(targetBranch);
      } else {
        await gitManager.checkout(targetBranch);
      }

      status.status = 'syncing';

      // Cherry-pick
      const result = await gitManager.cherryPick(commitHash, true);

      if (result.success) {
        // Commit the changes
        const commitInfo = await gitManager.getCommitInfo(commitHash);
        await gitManager.commit(`[crossrepo] ${commitInfo?.message || commitHash}`);

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
        
        await gitManager.resolveFile(filePath, resolution.content);
      }

      // Continue cherry-pick
      await gitManager.continueCherryPick();
      return true;
    } catch (error) {
      console.error(`Failed to resolve conflicts: ${error}`);
      await gitManager.abortCherryPick();
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
  }> {
    const repos = [];
    let total = 0;

    for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
      const repoTotal = repoConfig.commits.length * repoConfig.targetBranches.length;
      total += repoTotal;

      repos.push({
        name: repoName,
        commits: repoConfig.commits,
        branches: repoConfig.targetBranches,
        total: repoTotal,
      });
    }

    return { repos, total };
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