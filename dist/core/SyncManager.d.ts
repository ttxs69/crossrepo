/**
 * @fileoverview Synchronization manager
 * @module crossrepo/core/SyncManager
 */
import { GitManager } from './GitManager';
import { ConfigManager } from './ConfigManager';
import { ProjectConfig, SyncStatus, SyncOptions } from '../types';
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
export declare class SyncManager {
    private config;
    private configManager;
    private gitManagers;
    private aiResolver;
    private progressCallback?;
    constructor(config: ProjectConfig, configManager: ConfigManager);
    private initGitManagers;
    /**
     * Set progress callback
     */
    onProgress(callback: ProgressCallback): void;
    /**
     * Sync all repos and branches
     */
    sync(options: SyncOptions): Promise<SyncStatus[]>;
    private syncCommit;
    private resolveConflicts;
    private calculateTotal;
    /**
     * Preview sync (dry run)
     */
    preview(): Promise<{
        repos: Array<{
            name: string;
            commits: string[];
            branches: string[];
            total: number;
        }>;
        total: number;
    }>;
    /**
     * Get current status of all repos
     */
    status(): Promise<Array<{
        repo: string;
        branch: string;
        hasChanges: boolean;
        conflicts: string[];
    }>>;
    /**
     * Test AI connection
     */
    testAI(): Promise<boolean>;
    /**
     * Get repo git manager
     */
    getGitManager(repoName: string): GitManager | undefined;
}
//# sourceMappingURL=SyncManager.d.ts.map