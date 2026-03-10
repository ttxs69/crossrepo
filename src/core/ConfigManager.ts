/**
 * @fileoverview Configuration management
 * @module crossrepo/core/ConfigManager
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { ProjectConfig, FeatureConfig, AIConfig, RepoCommits } from '../types';

const CONFIG_FILE = 'crossrepo.yaml';
const FEATURES_DIR = '.crossrepo/features';

export class ConfigManager {
  private projectPath: string;

  constructor(projectPath: string = process.cwd()) {
    this.projectPath = projectPath;
  }

  /**
   * Check if config exists
   */
  exists(): boolean {
    return fs.existsSync(path.join(this.projectPath, CONFIG_FILE));
  }

  /**
   * Load project config
   */
  load(): ProjectConfig | null {
    const configPath = path.join(this.projectPath, CONFIG_FILE);
    
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const content = fs.readFileSync(configPath, 'utf-8');
    return yaml.parse(content) as ProjectConfig;
  }

  /**
   * Save project config
   */
  save(config: ProjectConfig): void {
    const configPath = path.join(this.projectPath, CONFIG_FILE);
    const content = yaml.stringify(config, { lineWidth: 0 });
    fs.writeFileSync(configPath, content, 'utf-8');
  }

  /**
   * Initialize new project config
   */
  init(featureName: string): ProjectConfig {
    const config: ProjectConfig = {
      feature: featureName,
      repos: {},
    };

    this.save(config);
    return config;
  }

  /**
   * Add or update repository
   */
  addRepo(
    config: ProjectConfig,
    repoName: string,
    repoPath: string,
    commits: string[] = [],
    targetBranches: string[] = []
  ): ProjectConfig {
    config.repos[repoName] = {
      path: repoPath,
      commits,
      targetBranches,
    };

    this.save(config);
    return config;
  }

  /**
   * Remove repository
   */
  removeRepo(config: ProjectConfig, repoName: string): ProjectConfig {
    delete config.repos[repoName];
    this.save(config);
    return config;
  }

  /**
   * Set AI configuration
   */
  setAI(config: ProjectConfig, aiConfig: AIConfig): ProjectConfig {
    config.ai = aiConfig;
    this.save(config);
    return config;
  }

  /**
   * Add commits to a repo
   */
  addCommits(
    config: ProjectConfig,
    repoName: string,
    commits: string[]
  ): ProjectConfig {
    if (config.repos[repoName]) {
      config.repos[repoName].commits = [
        ...new Set([...config.repos[repoName].commits, ...commits]),
      ];
      this.save(config);
    }
    return config;
  }

  /**
   * Set target branches for a repo
   */
  setTargetBranches(
    config: ProjectConfig,
    repoName: string,
    branches: string[]
  ): ProjectConfig {
    if (config.repos[repoName]) {
      config.repos[repoName].targetBranches = branches;
      this.save(config);
    }
    return config;
  }

  /**
   * Save feature config (for reuse)
   */
  saveFeature(featureConfig: FeatureConfig): void {
    const featuresDir = path.join(this.projectPath, FEATURES_DIR);
    
    if (!fs.existsSync(featuresDir)) {
      fs.mkdirSync(featuresDir, { recursive: true });
    }

    const featurePath = path.join(featuresDir, `${featureConfig.name}.yaml`);
    const content = yaml.stringify(featureConfig, { lineWidth: 0 });
    fs.writeFileSync(featurePath, content, 'utf-8');
  }

  /**
   * Load feature config
   */
  loadFeature(featureName: string): FeatureConfig | null {
    const featurePath = path.join(this.projectPath, FEATURES_DIR, `${featureName}.yaml`);
    
    if (!fs.existsSync(featurePath)) {
      return null;
    }

    const content = fs.readFileSync(featurePath, 'utf-8');
    return yaml.parse(content) as FeatureConfig;
  }

  /**
   * List saved features
   */
  listFeatures(): string[] {
    const featuresDir = path.join(this.projectPath, FEATURES_DIR);
    
    if (!fs.existsSync(featuresDir)) {
      return [];
    }

    return fs
      .readdirSync(featuresDir)
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => f.replace('.yaml', ''));
  }

  /**
   * Convert project config to feature config
   */
  toFeatureConfig(config: ProjectConfig): FeatureConfig {
    return {
      name: config.feature,
      ai: config.ai,
      repos: config.repos,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate config
   */
  validate(config: ProjectConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.feature) {
      errors.push('Feature name is required');
    }

    for (const [repoName, repo] of Object.entries(config.repos)) {
      if (!repo.path) {
        errors.push(`Repository "${repoName}" is missing path`);
      }

      if (!fs.existsSync(repo.path)) {
        errors.push(`Repository path "${repo.path}" does not exist`);
      }

      if (repo.commits.length === 0) {
        errors.push(`Repository "${repoName}" has no commits to sync`);
      }

      if (repo.targetBranches.length === 0) {
        errors.push(`Repository "${repoName}" has no target branches`);
      }
    }

    if (config.ai) {
      if (!config.ai.baseUrl) {
        errors.push('AI baseUrl is required');
      }
      if (!config.ai.model) {
        errors.push('AI model is required');
      }
      if (!config.ai.apiKey) {
        errors.push('AI apiKey is required');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get config path
   */
  getConfigPath(): string {
    return path.join(this.projectPath, CONFIG_FILE);
  }
}