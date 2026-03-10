/**
 * @fileoverview Git operations manager
 * @module crossrepo/core/GitManager
 */
import { GitResult, CherryPickResult, ConflictInfo } from '../types';
export declare class GitManager {
    private git;
    private repoPath;
    constructor(repoPath: string);
    /**
     * Check if path is a git repository
     */
    static isRepo(path: string): boolean;
    /**
     * Get current branch name
     */
    getCurrentBranch(): Promise<string>;
    /**
     * Get list of branches
     */
    getBranches(): Promise<string[]>;
    /**
     * Check if branch exists
     */
    branchExists(branch: string): Promise<boolean>;
    /**
     * Create a new branch
     */
    createBranch(branch: string, from?: string): Promise<GitResult>;
    /**
     * Checkout a branch
     */
    checkout(branch: string): Promise<GitResult>;
    /**
     * Get commit info
     */
    getCommitInfo(commitHash: string): Promise<{
        hash: string;
        message: string;
        author: string;
        date: string;
    } | null>;
    /**
     * Cherry-pick a commit
     */
    cherryPick(commitHash: string, noCommit?: boolean): Promise<CherryPickResult>;
    /**
     * Get current conflicts
     */
    getConflicts(): Promise<ConflictInfo>;
    /**
     * Get conflict markers from a file
     */
    getConflictMarkers(filePath: string): Promise<{
        ours: string;
        theirs: string;
        base?: string;
    } | null>;
    /**
     * Abort ongoing cherry-pick
     */
    abortCherryPick(): Promise<GitResult>;
    /**
     * Continue cherry-pick after resolving conflicts
     */
    continueCherryPick(): Promise<GitResult>;
    /**
     * Stage files
     */
    stage(files: string[]): Promise<GitResult>;
    /**
     * Commit staged changes
     */
    commit(message: string): Promise<GitResult>;
    /**
     * Write resolved content to file
     */
    resolveFile(filePath: string, content: string): Promise<GitResult>;
    /**
     * Get diff between branches
     */
    getDiff(from: string, to: string): Promise<string>;
    /**
     * Push to remote
     */
    push(branch?: string, remote?: string): Promise<GitResult>;
    /**
     * Fetch from remote
     */
    fetch(remote?: string): Promise<GitResult>;
    /**
     * Check if there are uncommitted changes
     */
    hasUncommittedChanges(): Promise<boolean>;
    /**
     * Stash current changes
     */
    stash(message?: string): Promise<GitResult>;
    /**
     * Pop stashed changes
     */
    stashPop(): Promise<GitResult>;
    /**
     * Get repo path
     */
    getRepoPath(): string;
}
//# sourceMappingURL=GitManager.d.ts.map