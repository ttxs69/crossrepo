"use strict";
/**
 * @fileoverview Git operations manager
 * @module crossrepo/core/GitManager
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitManager = void 0;
const simple_git_1 = __importDefault(require("simple-git"));
const child_process_1 = require("child_process");
class GitManager {
    git;
    repoPath;
    constructor(repoPath) {
        this.repoPath = repoPath;
        this.git = (0, simple_git_1.default)(repoPath);
    }
    /**
     * Check if path is a git repository
     */
    static isRepo(path) {
        try {
            (0, child_process_1.execSync)('git rev-parse --git-dir', { cwd: path, stdio: 'pipe' });
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get current branch name
     */
    async getCurrentBranch() {
        const status = await this.git.status();
        return status.current || 'HEAD';
    }
    /**
     * Get list of branches
     */
    async getBranches() {
        const branches = await this.git.branchLocal();
        return branches.all;
    }
    /**
     * Check if branch exists
     */
    async branchExists(branch) {
        const branches = await this.getBranches();
        return branches.includes(branch);
    }
    /**
     * Create a new branch
     */
    async createBranch(branch, from) {
        try {
            if (from) {
                await this.git.checkoutBranch(branch, from);
            }
            else {
                await this.git.checkoutLocalBranch(branch);
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Checkout a branch
     */
    async checkout(branch) {
        try {
            await this.git.checkout(branch);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Get commit info
     */
    async getCommitInfo(commitHash) {
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
        }
        catch {
            return null;
        }
    }
    /**
     * Cherry-pick a commit
     */
    async cherryPick(commitHash, noCommit = false) {
        try {
            const args = noCommit ? ['--no-commit'] : [];
            await this.git.raw(['cherry-pick', ...args, commitHash]);
            return { success: true, commit: commitHash };
        }
        catch (error) {
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
    async getConflicts() {
        const status = await this.git.status();
        const conflictedFiles = status.conflicted;
        const content = {};
        for (const file of conflictedFiles) {
            try {
                const fileContent = await this.git.show([`HEAD:${file}`]);
                content[file] = fileContent;
            }
            catch {
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
    async getConflictMarkers(filePath) {
        try {
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
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
        }
        catch {
            return null;
        }
    }
    /**
     * Abort ongoing cherry-pick
     */
    async abortCherryPick() {
        try {
            await this.git.raw(['cherry-pick', '--abort']);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Continue cherry-pick after resolving conflicts
     */
    async continueCherryPick() {
        try {
            await this.git.raw(['cherry-pick', '--continue']);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Stage files
     */
    async stage(files) {
        try {
            await this.git.add(files);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Commit staged changes
     */
    async commit(message) {
        try {
            await this.git.commit(message);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Write resolved content to file
     */
    async resolveFile(filePath, content) {
        try {
            const fs = await Promise.resolve().then(() => __importStar(require('fs')));
            const fullPath = require('path').join(this.repoPath, filePath);
            fs.writeFileSync(fullPath, content, 'utf-8');
            await this.stage([filePath]);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Get diff between branches
     */
    async getDiff(from, to) {
        try {
            return await this.git.diff([from, to]);
        }
        catch {
            return '';
        }
    }
    /**
     * Push to remote
     */
    async push(branch, remote = 'origin') {
        try {
            if (branch) {
                await this.git.push(remote, branch);
            }
            else {
                await this.git.push();
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Fetch from remote
     */
    async fetch(remote = 'origin') {
        try {
            await this.git.fetch(remote);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Check if there are uncommitted changes
     */
    async hasUncommittedChanges() {
        const status = await this.git.status();
        return !status.isClean();
    }
    /**
     * Stash current changes
     */
    async stash(message) {
        try {
            if (message) {
                await this.git.stash(['push', '-m', message]);
            }
            else {
                await this.git.stash();
            }
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Pop stashed changes
     */
    async stashPop() {
        try {
            await this.git.stash(['pop']);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: String(error) };
        }
    }
    /**
     * Get repo path
     */
    getRepoPath() {
        return this.repoPath;
    }
}
exports.GitManager = GitManager;
//# sourceMappingURL=GitManager.js.map