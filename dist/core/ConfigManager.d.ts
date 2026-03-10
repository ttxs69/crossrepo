/**
 * @fileoverview Configuration management
 * @module crossrepo/core/ConfigManager
 */
import { ProjectConfig, FeatureConfig, AIConfig } from '../types';
export declare class ConfigManager {
    private projectPath;
    constructor(projectPath?: string);
    /**
     * Check if config exists
     */
    exists(): boolean;
    /**
     * Load project config
     */
    load(): ProjectConfig | null;
    /**
     * Save project config
     */
    save(config: ProjectConfig): void;
    /**
     * Initialize new project config
     */
    init(featureName: string): ProjectConfig;
    /**
     * Add or update repository
     */
    addRepo(config: ProjectConfig, repoName: string, repoPath: string, commits?: string[], targetBranches?: string[]): ProjectConfig;
    /**
     * Remove repository
     */
    removeRepo(config: ProjectConfig, repoName: string): ProjectConfig;
    /**
     * Set AI configuration
     */
    setAI(config: ProjectConfig, aiConfig: AIConfig): ProjectConfig;
    /**
     * Add commits to a repo
     */
    addCommits(config: ProjectConfig, repoName: string, commits: string[]): ProjectConfig;
    /**
     * Set target branches for a repo
     */
    setTargetBranches(config: ProjectConfig, repoName: string, branches: string[]): ProjectConfig;
    /**
     * Save feature config (for reuse)
     */
    saveFeature(featureConfig: FeatureConfig): void;
    /**
     * Load feature config
     */
    loadFeature(featureName: string): FeatureConfig | null;
    /**
     * List saved features
     */
    listFeatures(): string[];
    /**
     * Convert project config to feature config
     */
    toFeatureConfig(config: ProjectConfig): FeatureConfig;
    /**
     * Validate config
     */
    validate(config: ProjectConfig): {
        valid: boolean;
        errors: string[];
    };
    /**
     * Get config path
     */
    getConfigPath(): string;
}
//# sourceMappingURL=ConfigManager.d.ts.map