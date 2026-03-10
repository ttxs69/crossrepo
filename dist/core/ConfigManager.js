"use strict";
/**
 * @fileoverview Configuration management
 * @module crossrepo/core/ConfigManager
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml = __importStar(require("yaml"));
const CONFIG_FILE = 'crossrepo.yaml';
const FEATURES_DIR = '.crossrepo/features';
class ConfigManager {
    projectPath;
    constructor(projectPath = process.cwd()) {
        this.projectPath = projectPath;
    }
    /**
     * Check if config exists
     */
    exists() {
        return fs.existsSync(path.join(this.projectPath, CONFIG_FILE));
    }
    /**
     * Load project config
     */
    load() {
        const configPath = path.join(this.projectPath, CONFIG_FILE);
        if (!fs.existsSync(configPath)) {
            return null;
        }
        const content = fs.readFileSync(configPath, 'utf-8');
        return yaml.parse(content);
    }
    /**
     * Save project config
     */
    save(config) {
        const configPath = path.join(this.projectPath, CONFIG_FILE);
        const content = yaml.stringify(config, { lineWidth: 0 });
        fs.writeFileSync(configPath, content, 'utf-8');
    }
    /**
     * Initialize new project config
     */
    init(featureName) {
        const config = {
            feature: featureName,
            repos: {},
        };
        this.save(config);
        return config;
    }
    /**
     * Add or update repository
     */
    addRepo(config, repoName, repoPath, commits = [], targetBranches = []) {
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
    removeRepo(config, repoName) {
        delete config.repos[repoName];
        this.save(config);
        return config;
    }
    /**
     * Set AI configuration
     */
    setAI(config, aiConfig) {
        config.ai = aiConfig;
        this.save(config);
        return config;
    }
    /**
     * Add commits to a repo
     */
    addCommits(config, repoName, commits) {
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
    setTargetBranches(config, repoName, branches) {
        if (config.repos[repoName]) {
            config.repos[repoName].targetBranches = branches;
            this.save(config);
        }
        return config;
    }
    /**
     * Save feature config (for reuse)
     */
    saveFeature(featureConfig) {
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
    loadFeature(featureName) {
        const featurePath = path.join(this.projectPath, FEATURES_DIR, `${featureName}.yaml`);
        if (!fs.existsSync(featurePath)) {
            return null;
        }
        const content = fs.readFileSync(featurePath, 'utf-8');
        return yaml.parse(content);
    }
    /**
     * List saved features
     */
    listFeatures() {
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
    toFeatureConfig(config) {
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
    validate(config) {
        const errors = [];
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
    getConfigPath() {
        return path.join(this.projectPath, CONFIG_FILE);
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=ConfigManager.js.map