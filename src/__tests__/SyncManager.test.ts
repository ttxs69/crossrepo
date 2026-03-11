import { SyncManager } from '../core/SyncManager';
import { ConfigManager } from '../core/ConfigManager';
import { GitManager } from '../core/GitManager';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('SyncManager', () => {
  const testDir = '/tmp/crossrepo-sync-test-' + Date.now();
  const repoDir = path.join(testDir, 'test-repo');
  const configManager = new ConfigManager(testDir);
  let syncManager: SyncManager;
  let commitHash: string;

  beforeAll(() => {
    // Create test repo
    fs.mkdirSync(repoDir, { recursive: true });
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });
    
    // Create initial commit on master
    fs.writeFileSync(path.join(repoDir, 'test.txt'), 'initial\n');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "initial"', { cwd: repoDir });
    commitHash = execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim();

    // Create a target branch
    execSync('git branch target-branch', { cwd: repoDir });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset config
    if (configManager.exists()) {
      fs.unlinkSync(configManager.getConfigPath());
    }
    const config = configManager.init('sync-test');
    configManager.addRepo(config, 'test-repo', repoDir, [commitHash], ['target-branch']);
    syncManager = new SyncManager(config, configManager);
  });

  describe('preview', () => {
    it('should return preview of sync operations', async () => {
      const preview = await syncManager.preview();

      expect(preview.total).toBe(1); // 1 commit × 1 branch
      expect(preview.repos).toHaveLength(1);
      expect(preview.repos[0].name).toBe('test-repo');
    });

    it('should calculate correct total for multiple commits and branches', async () => {
      let config = configManager.load()!;
      configManager.addRepo(config, 'test-repo', repoDir, ['c1', 'c2'], ['main', 'v1']);
      
      const sm = new SyncManager(config, configManager);
      const preview = await sm.preview();

      // test-repo: 2 commits × 2 branches = 4
      expect(preview.total).toBe(4);
    });

    it('should include warnings for invalid commits', async () => {
      let config = configManager.load()!;
      configManager.addRepo(config, 'test-repo', repoDir, ['invalidhash'], ['main']);
      
      const sm = new SyncManager(config, configManager);
      const preview = await sm.preview();

      expect(preview.warnings.length).toBeGreaterThan(0);
      expect(preview.warnings[0]).toContain('invalidhash');
    });
  });

  describe('status', () => {
    it('should return status for all repos', async () => {
      const status = await syncManager.status();

      expect(status).toHaveLength(1);
      expect(status[0].repo).toBe('test-repo');
      expect(status[0].branch).toBeDefined();
    });
  });

  describe('testAI', () => {
    it('should return false when AI not configured', async () => {
      const result = await syncManager.testAI();
      expect(result).toBe(false);
    });
  });

  describe('getGitManager', () => {
    it('should return git manager for repo', () => {
      const gm = syncManager.getGitManager('test-repo');
      expect(gm).toBeDefined();
      expect(gm?.getRepoPath()).toBe(repoDir);
    });

    it('should return undefined for unknown repo', () => {
      const gm = syncManager.getGitManager('unknown');
      expect(gm).toBeUndefined();
    });
  });

  describe('sync', () => {
    it('should sync commits to target branch', async () => {
      const results = await syncManager.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });

      expect(results.length).toBe(1);
      expect(results[0].status).toBe('success');
      expect(results[0].repo).toBe('test-repo');
      expect(results[0].branch).toBe('target-branch');
    });

    it('should handle non-existent commit', async () => {
      // Create new config with invalid commit
      const config = configManager.load()!;
      config.repos['test-repo'].commits = ['nonexistent123'];
      configManager.save(config);
      
      const sm = new SyncManager(config, configManager);
      const results = await sm.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });

      expect(results[0].status).toBe('failed');
      expect(results[0].error).toContain('not found');
    });

    it('should handle missing target branch with createBranch=true', async () => {
      // Create config with non-existent target branch
      const config = configManager.load()!;
      config.repos['test-repo'].targetBranches = ['new-branch'];
      configManager.save(config);
      
      const sm = new SyncManager(config, configManager);
      const results = await sm.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: true,
        push: false,
      });

      // Should succeed and create the branch
      expect(results[0].status).toBe('success');
    });

    it('should fail for missing target branch without createBranch', async () => {
      const config = configManager.load()!;
      config.repos['test-repo'].targetBranches = ['nonexistent-branch'];
      configManager.save(config);
      
      const sm = new SyncManager(config, configManager);
      const results = await sm.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });

      expect(results[0].status).toBe('failed');
      expect(results[0].error).toContain('does not exist');
    });

    it('should restore stash after sync', async () => {
      const gitManager = new GitManager(repoDir);
      
      // Create uncommitted changes
      fs.writeFileSync(path.join(repoDir, 'unstaged.txt'), 'unstaged content');
      
      const hasChangesBefore = await gitManager.hasUncommittedChanges();
      expect(hasChangesBefore).toBe(true);
      
      // Sync should stash and restore
      await syncManager.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });
      
      // Check that changes were restored
      const hasChangesAfter = await gitManager.hasUncommittedChanges();
      expect(hasChangesAfter).toBe(true);
      
      // Cleanup
      fs.unlinkSync(path.join(repoDir, 'unstaged.txt'));
    });

    it('should continue on error when continueOnError is true', async () => {
      const config = configManager.load()!;
      config.repos['test-repo'].commits = ['invalid1', commitHash, 'invalid2'];
      configManager.save(config);
      
      const sm = new SyncManager(config, configManager);
      const results = await sm.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });

      // Should process all 3 commits
      expect(results.length).toBe(3);
    });

    it('should stop on error when continueOnError is false', async () => {
      const config = configManager.load()!;
      config.repos['test-repo'].commits = ['invalid1', commitHash];
      configManager.save(config);
      
      const sm = new SyncManager(config, configManager);
      const results = await sm.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: false,
        createBranch: false,
        push: false,
      });

      // Should stop after first failure
      expect(results.length).toBe(1);
      expect(results[0].status).toBe('failed');
    });
  });

  describe('onProgress', () => {
    it('should call progress callback during sync', async () => {
      const progressCalls: any[] = [];
      
      syncManager.onProgress((progress, status) => {
        progressCalls.push({ progress, status });
      });
      
      await syncManager.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });

      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });
});