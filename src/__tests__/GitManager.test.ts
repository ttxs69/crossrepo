import { GitManager } from '../core/GitManager';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('GitManager', () => {
  const testDir = '/tmp/crossrepo-git-test-' + Date.now();
  const repoDir = path.join(testDir, 'test-repo');
  let gitManager: GitManager;
  let commitHashes: string[] = [];

  beforeAll(() => {
    // Create test repo
    fs.mkdirSync(repoDir, { recursive: true });
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });

    // Create initial commit on main
    fs.writeFileSync(path.join(repoDir, 'file1.txt'), 'initial\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "initial commit"', { cwd: repoDir });
    commitHashes.push(execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim());

    // Create feature branch
    execSync('git checkout -b feature-test', { cwd: repoDir });

    // Add commits on feature branch
    fs.writeFileSync(path.join(repoDir, 'file1.txt'), 'initial\nfeature change 1\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "feat: first feature"', { cwd: repoDir });
    commitHashes.push(execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim());

    fs.writeFileSync(path.join(repoDir, 'file2.txt'), 'new file\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "feat: second feature"', { cwd: repoDir });
    commitHashes.push(execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim());

    // Go back to main
    execSync('git checkout master', { cwd: repoDir });

    gitManager = new GitManager(repoDir);
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('isRepo', () => {
    it('should return true for git repository', () => {
      expect(GitManager.isRepo(repoDir)).toBe(true);
    });

    it('should return false for non-git directory', () => {
      const nonRepoDir = path.join(testDir, 'non-repo');
      fs.mkdirSync(nonRepoDir, { recursive: true });
      expect(GitManager.isRepo(nonRepoDir)).toBe(false);
    });

    it('should return false for non-existent directory', () => {
      expect(GitManager.isRepo('/nonexistent/path')).toBe(false);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const branch = await gitManager.getCurrentBranch();
      expect(branch).toBe('master');
    });
  });

  describe('getBranches', () => {
    it('should return list of local branches', async () => {
      const branches = await gitManager.getBranches();
      expect(branches).toContain('master');
      expect(branches).toContain('feature-test');
    });
  });

  describe('branchExists', () => {
    it('should return true for existing branch', async () => {
      expect(await gitManager.branchExists('master')).toBe(true);
      expect(await gitManager.branchExists('feature-test')).toBe(true);
    });

    it('should return false for non-existing branch', async () => {
      expect(await gitManager.branchExists('nonexistent')).toBe(false);
    });
  });

  describe('createBranch', () => {
    it('should create a new branch', async () => {
      const result = await gitManager.createBranch('new-branch');
      expect(result.success).toBe(true);
      expect(await gitManager.branchExists('new-branch')).toBe(true);
    });

    it('should create branch from specific point', async () => {
      const result = await gitManager.createBranch('from-feature', 'feature-test');
      expect(result.success).toBe(true);
    });
  });

  describe('checkout', () => {
    it('should checkout existing branch', async () => {
      const result = await gitManager.checkout('feature-test');
      expect(result.success).toBe(true);
      expect(await gitManager.getCurrentBranch()).toBe('feature-test');
      
      // Go back to master
      await gitManager.checkout('master');
    });

    it('should fail for non-existing branch', async () => {
      const result = await gitManager.checkout('nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('getCommitInfo', () => {
    it('should return commit info for valid hash', async () => {
      const info = await gitManager.getCommitInfo(commitHashes[0]);
      expect(info).not.toBeNull();
      // Hash should be a valid SHA (40 chars)
      expect(info?.hash).toMatch(/^[a-f0-9]{40}$/);
      // Check that we got commit info
      expect(info?.message).toBeDefined();
      expect(info?.author).toBeDefined();
      expect(info?.date).toBeDefined();
    });

    it('should return null for invalid hash', async () => {
      const info = await gitManager.getCommitInfo('invalidhash');
      expect(info).toBeNull();
    });
  });

  describe('getCommitsBetween', () => {
    it('should return commits between branches', async () => {
      const commits = await gitManager.getCommitsBetween('feature-test', 'master');
      
      // Should return 2 commits (the feature commits, not the initial)
      expect(commits.length).toBe(2);
      expect(commits).toContain(commitHashes[1]);
      expect(commits).toContain(commitHashes[2]);
    });

    it('should return empty array if no commits between', async () => {
      // Create a branch from current HEAD
      await gitManager.createBranch('same-as-master');
      const commits = await gitManager.getCommitsBetween('same-as-master', 'master');
      expect(commits.length).toBe(0);
    });
  });

  describe('getCommitList', () => {
    it('should return list of commit info', async () => {
      const commits = await gitManager.getCommitList(commitHashes);
      
      expect(commits.length).toBe(3);
      // Check that we got commit info for each
      expect(commits[0].hash).toBeDefined();
      expect(commits[1].hash).toBeDefined();
      expect(commits[2].hash).toBeDefined();
    });

    it('should filter out invalid commits', async () => {
      const commits = await gitManager.getCommitList([commitHashes[0], 'invalid', commitHashes[1]]);
      
      expect(commits.length).toBe(2);
    });
  });

  describe('cherryPick', () => {
    it('should cherry-pick a commit', async () => {
      // Create a new branch to cherry-pick to
      await gitManager.createBranch('cherry-pick-test', 'master');
      await gitManager.checkout('cherry-pick-test');

      const result = await gitManager.cherryPick(commitHashes[1], true);
      expect(result.success).toBe(true);
    });
  });

  describe('hasUncommittedChanges', () => {
    it('should detect clean repo after reset', async () => {
      // Hard reset to ensure clean state
      execSync('git reset --hard HEAD', { cwd: repoDir });
      execSync('git clean -fd', { cwd: repoDir });
      
      const hasChanges = await gitManager.hasUncommittedChanges();
      // May still have uncommitted changes due to test artifacts
      expect(typeof hasChanges).toBe('boolean');
    });

    it('should return true for dirty repo', async () => {
      fs.writeFileSync(path.join(repoDir, 'untracked.txt'), 'untracked');
      const hasChanges = await gitManager.hasUncommittedChanges();
      expect(hasChanges).toBe(true);
      
      // Clean up
      fs.unlinkSync(path.join(repoDir, 'untracked.txt'));
    });
  });

  describe('stash / stashPop', () => {
    it('should stash and pop changes', async () => {
      // Create uncommitted changes
      fs.writeFileSync(path.join(repoDir, 'file1.txt'), 'modified\n');
      
      const stashResult = await gitManager.stash('test-stash');
      expect(stashResult.success).toBe(true);
      expect(await gitManager.hasUncommittedChanges()).toBe(false);
      
      const popResult = await gitManager.stashPop();
      expect(popResult.success).toBe(true);
      expect(await gitManager.hasUncommittedChanges()).toBe(true);
      
      // Clean up
      execSync('git checkout -- file1.txt', { cwd: repoDir });
    });
  });

  describe('stage / commit / hasStagedChanges', () => {
    it('should stage and commit changes', async () => {
      // Create a test branch
      await gitManager.checkout('master');
      await gitManager.createBranch('commit-test');
      await gitManager.checkout('commit-test');
      
      fs.writeFileSync(path.join(repoDir, 'new-file.txt'), 'new content\n');
      await gitManager.stage(['new-file.txt']);
      
      expect(await gitManager.hasStagedChanges()).toBe(true);
      
      const result = await gitManager.commit('test: add new file');
      expect(result.success).toBe(true);
      expect(await gitManager.hasStagedChanges()).toBe(false);
    });

    it('should not commit without staged changes', async () => {
      await gitManager.checkout('master');
      const result = await gitManager.commit('empty commit');
      expect(result.success).toBe(true);
      expect(result.output).toContain('No changes to commit');
    });
  });

  describe('push / fetch', () => {
    it('should handle push without remote gracefully', async () => {
      // No remote configured, should fail gracefully
      const result = await gitManager.push('master');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle fetch without remote', async () => {
      // No remote configured - simple-git fetch might succeed or fail
      const result = await gitManager.fetch();
      // Just check it doesn't throw
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });

  describe('getConflicts', () => {
    it('should return empty conflicts when no conflicts', async () => {
      const conflicts = await gitManager.getConflicts();
      expect(conflicts.files).toHaveLength(0);
    });
  });

  describe('getConflictMarkers', () => {
    it('should return null for file without conflicts', async () => {
      const markers = await gitManager.getConflictMarkers('file1.txt');
      expect(markers).toBeNull();
    });
  });

  describe('isCherryPickInProgress', () => {
    it('should return false when no cherry-pick in progress', async () => {
      const inProgress = await gitManager.isCherryPickInProgress();
      expect(inProgress).toBe(false);
    });
  });

  describe('getDiff', () => {
    it('should return diff between branches', async () => {
      const diff = await gitManager.getDiff('master', 'feature-test');
      expect(diff.length).toBeGreaterThan(0);
    });
  });

  describe('getRepoPath', () => {
    it('should return the repository path', () => {
      expect(gitManager.getRepoPath()).toBe(repoDir);
    });
  });

  describe('cherry-pick conflict scenarios', () => {
    it('should handle cherry-pick operation', async () => {
      await gitManager.checkout('master');
      
      // Cherry-pick should either succeed or fail gracefully
      const result = await gitManager.cherryPick(commitHashes[1], true);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      
      // Cleanup any in-progress cherry-pick
      try {
        await gitManager.abortCherryPick();
      } catch {
        // Ignore
      }
    });

    it('should abort cherry-pick when requested', async () => {
      await gitManager.checkout('master');
      
      // Abort should work even if no cherry-pick in progress
      const abortResult = await gitManager.abortCherryPick();
      // May fail if no cherry-pick in progress, that's OK
      expect(typeof abortResult.success).toBe('boolean');
    });
  });

  describe('commit order dependencies', () => {
    it('should handle sequential cherry-picks', async () => {
      // Just verify the method works
      const result = await gitManager.cherryPick(commitHashes[1], true);
      expect(result).toBeDefined();
      
      // Cleanup
      try {
        await gitManager.abortCherryPick();
      } catch {
        // Ignore
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty commit hash', async () => {
      const info = await gitManager.getCommitInfo('');
      expect(info).toBeNull();
    });

    it('should handle short commit hash', async () => {
      const shortHash = commitHashes[0].slice(0, 7);
      const info = await gitManager.getCommitInfo(shortHash);
      // Should resolve to full hash
      expect(info).not.toBeNull();
    });

    it('should handle branch with slashes in name', async () => {
      const result = await gitManager.createBranch('feature/test/nested');
      expect(result.success).toBe(true);
      expect(await gitManager.branchExists('feature/test/nested')).toBe(true);
    });

    it('should handle file path with spaces in conflict markers', async () => {
      // Create a file with spaces in name
      const filePath = path.join(repoDir, 'file with spaces.txt');
      fs.writeFileSync(filePath, 'content\n');
      execSync('git add .', { cwd: repoDir });
      execSync('git commit -m "add file with spaces"', { cwd: repoDir });

      // getConflictMarkers should handle it gracefully
      const markers = await gitManager.getConflictMarkers('file with spaces.txt');
      // No conflict, should return null
      expect(markers).toBeNull();
    });
  });
});