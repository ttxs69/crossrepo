/**
 * @fileoverview Git operations manager
 * @module crossrepo/core/GitManager
 */

import simpleGit, { SimpleGit, StatusResult } from 'simple-git';
import { GitResult, CherryPickResult, ConflictInfo } from '../types';
import { execSync } from 'child_process';

export class GitManager {
  private git: SimpleGit;
  private repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
    this.git = simpleGit(repoPath);
  }

  /**
   * Check if path is a git repository
   */
  static isRepo(path: string): boolean {
    try {
      execSync('git rev-parse --git-dir', { cwd: path, stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const status = await this.git.status();
    return status.current || 'HEAD';
  }

  /**
   * Get list of branches
   */
  async getBranches(): Promise<string[]> {
    const branches = await this.git.branchLocal();
    return branches.all;
  }

  /**
   * Check if branch exists
   */
  async branchExists(branch: string): Promise<boolean> {
    const branches = await this.getBranches();
    return branches.includes(branch);
  }

  /**
   * Create a new branch
   */
  async createBranch(branch: string, from?: string): Promise<GitResult> {
    try {
      if (from) {
        await this.git.checkoutBranch(branch, from);
      } else {
        await this.git.checkoutLocalBranch(branch);
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Checkout a branch
   */
  async checkout(branch: string): Promise<GitResult> {
    try {
      await this.git.checkout(branch);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get commit info
   */
  async getCommitInfo(commitHash: string): Promise<{
    hash: string;
    message: string;
    author: string;
    date: string;
  } | null> {
    try {
      const log = await this.git.log(['-1', '--format=%H%n%s%n%an%n%ai', commitHash]);
      if (log.latest) {
        return {
          hash: log.latest.hash,
          message: log.latest.message,
          author: log.latest.author_name || 'unknown',
          date: log.latest.date,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Cherry-pick a commit
   */
  async cherryPick(commitHash: string, noCommit = false): Promise<CherryPickResult> {
    try {
      const args = noCommit ? ['--no-commit'] : [];
      await this.git.raw(['cherry-pick', ...args, commitHash]);
      return { success: true, commit: commitHash };
    } catch (error) {
      const errorStr = String(error);
      
      // Check for conflicts
      if (errorStr.includes('conflict') || errorStr.includes('CONFLICT')) {
        const conflicts = await this.getConflicts();
        return {
          success: false,
          error: 'Cherry-pick resulted in conflicts',
          conflicts,
        };
      }
      
      return {
        success: false,
        error: errorStr,
      };
    }
  }

  /**
   * Get current conflicts
   */
  async getConflicts(): Promise<ConflictInfo> {
    const status = await this.git.status();
    const conflictedFiles = status.conflicted;
    
    const content: Record<string, string> = {};
    
    for (const file of conflictedFiles) {
      try {
        const fileContent = await this.git.show([`HEAD:${file}`]);
        content[file] = fileContent;
      } catch {
        // File might be new or deleted
        content[file] = '';
      }
    }
    
    return {
      files: conflictedFiles,
      content,
    };
  }

  /**
   * Get conflict markers from a file
   */
  async getConflictMarkers(filePath: string): Promise<{
    ours: string;
    theirs: string;
    base?: string;
  } | null> {
    try {
      const fs = await import('fs');
      const fullPath = require('path').join(this.repoPath, filePath);
      const content = fs.readFileSync(fullPath, 'utf-8');
      
      // Parse conflict markers
      const oursMatch = content.match(/<<<<<<< .+?\n([\s\S]*?)=======/);
      const theirsMatch = content.match(/=======\n([\s\S]*?)>>>>>>>/);
      
      if (oursMatch && theirsMatch) {
        return {
          ours: oursMatch[1].trim(),
          theirs: theirsMatch[1].trim(),
        };
      }
      
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Abort ongoing cherry-pick
   */
  async abortCherryPick(): Promise<GitResult> {
    try {
      await this.git.raw(['cherry-pick', '--abort']);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Continue cherry-pick after resolving conflicts
   */
  async continueCherryPick(): Promise<GitResult> {
    try {
      await this.git.raw(['cherry-pick', '--continue']);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Stage files
   */
  async stage(files: string[]): Promise<GitResult> {
    try {
      await this.git.add(files);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Commit staged changes
   */
  async commit(message: string): Promise<GitResult> {
    try {
      await this.git.commit(message);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Write resolved content to file
   */
  async resolveFile(filePath: string, content: string): Promise<GitResult> {
    try {
      const fs = await import('fs');
      const fullPath = require('path').join(this.repoPath, filePath);
      fs.writeFileSync(fullPath, content, 'utf-8');
      await this.stage([filePath]);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get diff between branches
   */
  async getDiff(from: string, to: string): Promise<string> {
    try {
      return await this.git.diff([from, to]);
    } catch {
      return '';
    }
  }

  /**
   * Push to remote
   */
  async push(branch?: string, remote = 'origin'): Promise<GitResult> {
    try {
      if (branch) {
        await this.git.push(remote, branch);
      } else {
        await this.git.push();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Fetch from remote
   */
  async fetch(remote = 'origin'): Promise<GitResult> {
    try {
      await this.git.fetch(remote);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Check if there are uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const status = await this.git.status();
    return !status.isClean();
  }

  /**
   * Stash current changes
   */
  async stash(message?: string): Promise<GitResult> {
    try {
      if (message) {
        await this.git.stash(['push', '-m', message]);
      } else {
        await this.git.stash();
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Pop stashed changes
   */
  async stashPop(): Promise<GitResult> {
    try {
      await this.git.stash(['pop']);
      return { success: true };
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Get repo path
   */
  getRepoPath(): string {
    return this.repoPath;
  }
}