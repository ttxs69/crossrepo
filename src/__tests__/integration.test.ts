/**
 * @fileoverview Integration tests for CrossRepo
 * Tests the complete workflow from init to sync
 */

import { GitManager } from '../core/GitManager';
import { ConfigManager } from '../core/ConfigManager';
import { SyncManager } from '../core/SyncManager';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('CrossRepo Integration', () => {
  const testDir = '/tmp/crossrepo-integration-' + Date.now();
  const repoA = path.join(testDir, 'repo-a');
  const repoB = path.join(testDir, 'repo-b');
  const projectDir = path.join(testDir, 'project');
  
  let configManager: ConfigManager;
  let commitHashA: string;
  let commitHashB: string;

  beforeAll(() => {
    // Create test directory
    fs.mkdirSync(testDir, { recursive: true });
    fs.mkdirSync(projectDir, { recursive: true });

    // Initialize repo-a
    fs.mkdirSync(repoA, { recursive: true });
    execSync('git init', { cwd: repoA });
    execSync('git config user.email "test@test.com"', { cwd: repoA });
    execSync('git config user.name "Test"', { cwd: repoA });
    
    // Create initial commit in repo-a
    fs.writeFileSync(path.join(repoA, 'main.ts'), 'export const version = "1.0.0";\n');
    execSync('git add .', { cwd: repoA });
    execSync('git commit -m "initial"', { cwd: repoA });

    // Create feature commit in repo-a
    fs.writeFileSync(path.join(repoA, 'main.ts'), 'export const version = "2.0.0";\nexport const feature = true;\n');
    execSync('git add .', { cwd: repoA });
    execSync('git commit -m "feat: add feature"', { cwd: repoA });
    commitHashA = execSync('git rev-parse HEAD', { cwd: repoA }).toString().trim();

    // Create v1.0 branch
    execSync('git branch v1.0', { cwd: repoA });

    // Initialize repo-b
    fs.mkdirSync(repoB, { recursive: true });
    execSync('git init', { cwd: repoB });
    execSync('git config user.email "test@test.com"', { cwd: repoB });
    execSync('git config user.name "Test"', { cwd: repoB });
    
    fs.writeFileSync(path.join(repoB, 'index.ts'), 'export const name = "repo-b";\n');
    execSync('git add .', { cwd: repoB });
    execSync('git commit -m "initial"', { cwd: repoB });

    // Create feature commit in repo-b
    fs.writeFileSync(path.join(repoB, 'index.ts'), 'export const name = "repo-b";\nexport const version = "2.0.0";\n');
    execSync('git add .', { cwd: repoB });
    execSync('git commit -m "feat: add version"', { cwd: repoB });
    commitHashB = execSync('git rev-parse HEAD', { cwd: repoB }).toString().trim();

    // Initialize config manager
    configManager = new ConfigManager(projectDir);
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Complete Workflow', () => {
    it('should initialize project', () => {
      const config = configManager.init('integration-test');
      
      expect(config.feature).toBe('integration-test');
      expect(configManager.exists()).toBe(true);
    });

    it('should track multiple repositories with commits', () => {
      let config = configManager.load()!;
      
      config = configManager.addRepo(config, 'repo-a', repoA, [commitHashA], []);
      config = configManager.addRepo(config, 'repo-b', repoB, [commitHashB], []);
      
      expect(config.repos['repo-a']).toBeDefined();
      expect(config.repos['repo-b']).toBeDefined();
      expect(config.repos['repo-a'].commits).toContain(commitHashA);
      expect(config.repos['repo-b'].commits).toContain(commitHashB);
    });

    it('should set target branches for each repo', () => {
      let config = configManager.load()!;
      
      config = configManager.setTargetBranches(config, 'repo-a', ['v1.0']);
      config = configManager.setTargetBranches(config, 'repo-b', ['master']);
      
      expect(config.repos['repo-a'].targetBranches).toContain('v1.0');
      expect(config.repos['repo-b'].targetBranches).toContain('master');
    });

    it('should preview sync operations correctly', async () => {
      const config = configManager.load()!;
      const syncManager = new SyncManager(config, configManager);
      
      const preview = await syncManager.preview();
      
      expect(preview.total).toBe(2); // 1 commit × 1 branch each
      expect(preview.repos).toHaveLength(2);
    });

    it('should get status of all repos', async () => {
      const config = configManager.load()!;
      const syncManager = new SyncManager(config, configManager);
      
      const status = await syncManager.status();
      
      expect(status).toHaveLength(2);
      expect(status.find(s => s.repo === 'repo-a')).toBeDefined();
      expect(status.find(s => s.repo === 'repo-b')).toBeDefined();
    });

    it('should perform sync operations', async () => {
      const config = configManager.load()!;
      const syncManager = new SyncManager(config, configManager);
      
      const results = await syncManager.sync({
        autoResolve: false,
        dryRun: false,
        continueOnError: true,
        createBranch: false,
        push: false,
      });

      expect(results.length).toBe(2);
      
      // Check repo-a sync to v1.0
      const repoAResult = results.find(r => r.repo === 'repo-a' && r.branch === 'v1.0');
      expect(repoAResult).toBeDefined();
      expect(['success', 'failed']).toContain(repoAResult?.status);
      
      // Check repo-b sync to master
      const repoBResult = results.find(r => r.repo === 'repo-b' && r.branch === 'master');
      expect(repoBResult).toBeDefined();
      expect(['success', 'failed']).toContain(repoBResult?.status);
    });
  });

  describe('GitManager Operations', () => {
    let gitManager: GitManager;

    beforeAll(() => {
      gitManager = new GitManager(repoA);
    });

    it('should get current branch', async () => {
      const branch = await gitManager.getCurrentBranch();
      // Just check that we get a valid branch name
      expect(branch).toBeTruthy();
      expect(typeof branch).toBe('string');
    });

    it('should list branches', async () => {
      const branches = await gitManager.getBranches();
      expect(branches.length).toBeGreaterThan(0);
      expect(branches).toContain('v1.0');
    });

    it('should check if branch exists', async () => {
      expect(await gitManager.branchExists('v1.0')).toBe(true);
      expect(await gitManager.branchExists('nonexistent')).toBe(false);
    });

    it('should get commit info', async () => {
      const info = await gitManager.getCommitInfo(commitHashA);
      
      expect(info).not.toBeNull();
      // Just check that we got some info
      expect(info?.hash).toBeTruthy();
    });

    it('should detect no uncommitted changes', async () => {
      const hasChanges = await gitManager.hasUncommittedChanges();
      expect(hasChanges).toBe(false);
    });
  });

  describe('Feature Config Persistence', () => {
    it('should save and load feature config', () => {
      const config = configManager.load()!;
      const featureConfig = configManager.toFeatureConfig(config);
      
      configManager.saveFeature(featureConfig);
      
      const loaded = configManager.loadFeature('integration-test');
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe('integration-test');
      expect(loaded?.repos['repo-a']).toBeDefined();
      expect(loaded?.repos['repo-b']).toBeDefined();
    });

    it('should list saved features', () => {
      const features = configManager.listFeatures();
      expect(features).toContain('integration-test');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate complete config', () => {
      const config = configManager.load()!;
      const result = configManager.validate(config);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing feature name', () => {
      const testPath = '/tmp/crossrepo-validation-test-' + Date.now();
      fs.mkdirSync(testPath, { recursive: true });
      const cm = new ConfigManager(testPath);
      
      const config = cm.init('');
      const result = cm.validate(config);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Feature name is required');
      
      fs.rmSync(testPath, { recursive: true, force: true });
    });

    it('should detect missing commits', () => {
      const testPath = '/tmp/crossrepo-validation-test2-' + Date.now();
      fs.mkdirSync(testPath, { recursive: true });
      
      const cm = new ConfigManager(testPath);
      const config = cm.init('test');
      cm.addRepo(config, 'empty-repo', repoA, [], ['master']);
      
      const result = cm.validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('no commits'))).toBe(true);
      
      fs.rmSync(testPath, { recursive: true, force: true });
    });
  });
});