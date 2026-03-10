"use strict";
/**
 * @fileoverview Synchronization manager
 * @module crossrepo/core/SyncManager
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncManager = void 0;
const GitManager_1 = require("./GitManager");
const AIResolver_1 = require("./AIResolver");
class SyncManager {
    config;
    configManager;
    gitManagers = new Map();
    aiResolver = null;
    progressCallback;
    constructor(config, configManager) {
        this.config = config;
        this.configManager = configManager;
        this.initGitManagers();
        if (config.ai) {
            this.aiResolver = new AIResolver_1.AIResolver(config.ai);
        }
    }
    initGitManagers() {
        for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
            const gitManager = new GitManager_1.GitManager(repoConfig.path);
            this.gitManagers.set(repoName, gitManager);
        }
    }
    /**
     * Set progress callback
     */
    onProgress(callback) {
        this.progressCallback = callback;
    }
    /**
     * Sync all repos and branches
     */
    async sync(options) {
        const results = [];
        const progress = {
            total: this.calculateTotal(),
            completed: 0,
            failed: 0,
            conflicts: 0,
        };
        for (const [repoName, repoConfig] of Object.entries(this.config.repos)) {
            const gitManager = this.gitManagers.get(repoName);
            if (!gitManager)
                continue;
            for (const branch of repoConfig.targetBranches) {
                for (const commit of repoConfig.commits) {
                    progress.current = { repo: repoName, branch, commit };
                    const status = await this.syncCommit(gitManager, repoName, branch, commit, options);
                    results.push(status);
                    if (status.status === 'success') {
                        progress.completed++;
                    }
                    else if (status.status === 'conflict') {
                        progress.conflicts++;
                        if (!options.continueOnError) {
                            break;
                        }
                    }
                    else if (status.status === 'failed') {
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
    async syncCommit(gitManager, repoName, targetBranch, commitHash, options) {
        const status = {
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
            }
            else {
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
            }
            else if (result.conflicts) {
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
            }
            else {
                status.status = 'failed';
                status.error = result.error;
            }
        }
        catch (error) {
            status.status = 'failed';
            status.error = String(error);
        }
        return status;
    }
    async resolveConflicts(gitManager, conflictInfo, commitHash) {
        if (!this.aiResolver)
            return false;
        try {
            for (const filePath of conflictInfo.files) {
                const markers = await gitManager.getConflictMarkers(filePath);
                if (!markers)
                    continue;
                const request = {
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
        }
        catch (error) {
            console.error(`Failed to resolve conflicts: ${error}`);
            await gitManager.abortCherryPick();
            return false;
        }
    }
    calculateTotal() {
        let total = 0;
        for (const repoConfig of Object.values(this.config.repos)) {
            total += repoConfig.commits.length * repoConfig.targetBranches.length;
        }
        return total;
    }
    /**
     * Preview sync (dry run)
     */
    async preview() {
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
    async status() {
        const results = [];
        for (const [repoName, gitManager] of this.gitManagers) {
            const branch = await gitManager.getCurrentBranch();
            const hasChanges = await gitManager.hasUncommittedChanges();
            let conflicts = [];
            try {
                const conflictInfo = await gitManager.getConflicts();
                conflicts = conflictInfo.files;
            }
            catch {
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
    async testAI() {
        if (!this.aiResolver) {
            return false;
        }
        return this.aiResolver.testConnection();
    }
    /**
     * Get repo git manager
     */
    getGitManager(repoName) {
        return this.gitManagers.get(repoName);
    }
}
exports.SyncManager = SyncManager;
//# sourceMappingURL=SyncManager.js.map