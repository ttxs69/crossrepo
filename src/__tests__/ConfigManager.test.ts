import { ConfigManager } from '../core/ConfigManager';
import * as fs from 'fs';
import * as path from 'path';

describe('ConfigManager', () => {
  const testDir = '/tmp/crossrepo-test-' + Date.now();
  const configManager = new ConfigManager(testDir);

  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    // Reset config before each test
    if (configManager.exists()) {
      fs.unlinkSync(configManager.getConfigPath());
    }
  });

  describe('init', () => {
    it('should create a new config file', () => {
      const config = configManager.init('test-feature');
      
      expect(config.feature).toBe('test-feature');
      expect(config.repos).toEqual({});
      expect(configManager.exists()).toBe(true);
    });
  });

  describe('load', () => {
    it('should load existing config', () => {
      configManager.init('test-feature');
      const config = configManager.load();
      
      expect(config).not.toBeNull();
      expect(config?.feature).toBe('test-feature');
    });

    it('should return null if config does not exist', () => {
      const cm = new ConfigManager('/nonexistent');
      expect(cm.load()).toBeNull();
    });
  });

  describe('addRepo', () => {
    it('should add a repository to config', () => {
      configManager.init('test-feature');
      let config = configManager.load()!;
      
      config = configManager.addRepo(config, 'test-repo', '/path/to/repo', ['abc123'], ['main', 'v1.0']);
      
      expect(config.repos['test-repo']).toBeDefined();
      expect(config.repos['test-repo'].path).toBe('/path/to/repo');
      expect(config.repos['test-repo'].commits).toContain('abc123');
      expect(config.repos['test-repo'].targetBranches).toContain('main');
      expect(config.repos['test-repo'].targetBranches).toContain('v1.0');
    });
  });

  describe('addCommits', () => {
    it('should add commits to existing repo', () => {
      configManager.init('test-feature');
      configManager.addRepo(configManager.load()!, 'test-repo', '/path/to/repo', ['abc123'], ['main']);
      
      let config = configManager.load()!;
      config = configManager.addCommits(config, 'test-repo', ['def456', 'ghi789']);
      
      expect(config.repos['test-repo'].commits).toContain('abc123');
      expect(config.repos['test-repo'].commits).toContain('def456');
      expect(config.repos['test-repo'].commits).toContain('ghi789');
    });

    it('should not duplicate commits', () => {
      configManager.init('test-feature');
      configManager.addRepo(configManager.load()!, 'test-repo', '/path/to/repo', ['abc123'], ['main']);
      
      let config = configManager.load()!;
      config = configManager.addCommits(config, 'test-repo', ['abc123']);
      
      const commitCount = config.repos['test-repo'].commits.filter(c => c === 'abc123').length;
      expect(commitCount).toBe(1);
    });
  });

  describe('setTargetBranches', () => {
    it('should set target branches', () => {
      configManager.init('test-feature');
      configManager.addRepo(configManager.load()!, 'test-repo', '/path/to/repo', ['abc123'], ['main']);
      
      let config = configManager.load()!;
      config = configManager.setTargetBranches(config, 'test-repo', ['v2.0', 'v3.0']);
      
      expect(config.repos['test-repo'].targetBranches).toEqual(['v2.0', 'v3.0']);
    });
  });

  describe('setAI', () => {
    it('should set AI configuration', () => {
      configManager.init('test-feature');
      let config = configManager.load()!;
      
      config = configManager.setAI(config, {
        provider: 'openai',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4',
        apiKey: 'test-key',
      });
      
      expect(config.ai).toBeDefined();
      expect(config.ai?.provider).toBe('openai');
      expect(config.ai?.model).toBe('gpt-4');
    });
  });

  describe('validate', () => {
    it('should validate a valid config', () => {
      // Create a valid config
      const testRepoPath = path.join(testDir, 'valid-repo');
      fs.mkdirSync(testRepoPath, { recursive: true });
      fs.mkdirSync(path.join(testRepoPath, '.git'), { recursive: true });
      
      configManager.init('valid-feature');
      configManager.addRepo(configManager.load()!, 'valid-repo', testRepoPath, ['abc123'], ['main']);
      
      const result = configManager.validate(configManager.load()!);
      
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing feature', () => {
      configManager.init('');
      const result = configManager.validate(configManager.load()!);
      
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Feature name is required');
    });
  });

  describe('saveFeature / loadFeature', () => {
    it('should save and load feature config', () => {
      configManager.init('feature-test');
      configManager.addRepo(configManager.load()!, 'test-repo', '/path', ['abc'], ['main']);
      
      const config = configManager.load()!;
      const featureConfig = configManager.toFeatureConfig(config);
      
      configManager.saveFeature(featureConfig);
      
      const loaded = configManager.loadFeature('feature-test');
      expect(loaded).not.toBeNull();
      expect(loaded?.name).toBe('feature-test');
    });

    it('should list saved features', () => {
      configManager.init('list-test');
      configManager.addRepo(configManager.load()!, 'test-repo', '/path', ['abc'], ['main']);
      
      const config = configManager.load()!;
      const featureConfig = configManager.toFeatureConfig(config);
      configManager.saveFeature(featureConfig);
      
      const features = configManager.listFeatures();
      expect(features).toContain('list-test');
    });
  });

  describe('removeRepo', () => {
    it('should remove a repository', () => {
      configManager.init('test-feature');
      configManager.addRepo(configManager.load()!, 'to-remove', '/path', [], []);
      configManager.addRepo(configManager.load()!, 'to-keep', '/path2', [], []);
      
      let config = configManager.load()!;
      config = configManager.removeRepo(config, 'to-remove');
      
      expect(config.repos['to-remove']).toBeUndefined();
      expect(config.repos['to-keep']).toBeDefined();
    });
  });
});