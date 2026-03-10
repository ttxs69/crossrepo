import { SyncManager } from '../core/SyncManager';
import { ConfigManager } from '../core/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('SyncManager', () => {
  const testDir = '/tmp/crossrepo-sync-test-' + Date.now();
  const repoDir = path.join(testDir, 'test-repo');
  const configManager = new ConfigManager(testDir);
  let syncManager: SyncManager;

  beforeAll(() => {
    // Create test repo
    fs.mkdirSync(repoDir, { recursive: true });
    execSync('git init', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });
    
    // Create initial commit
    fs.writeFileSync(path.join(repoDir, 'test.txt'), 'initial');
    execSync('git add .', { cwd: repoDir });
    execSync('git commit -m "initial"', { cwd: repoDir });
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    const config = configManager.init('sync-test');
    configManager.addRepo(config, 'test-repo', repoDir, ['abc123'], ['main']);
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
      config = configManager.addRepo(config, 'test-repo', repoDir, ['c1', 'c2'], ['main', 'v1']);
      
      const sm = new SyncManager(config, configManager);
      const preview = await sm.preview();

      // test-repo: 2 commits × 2 branches = 4
      expect(preview.total).toBe(4);
    });
  });

  describe('status', () => {
    it('should return status for all repos', async () => {
      const status = await syncManager.status();

      expect(status).toHaveLength(1);
      expect(status[0].repo).toBe('test-repo');
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
});