/**
 * @fileoverview Type definitions for CrossRepo
 * @module crossrepo/types
 */

/**
 * AI Provider configuration
 */
export interface AIConfig {
  /** Provider name: openai, anthropic, custom */
  provider: 'openai' | 'anthropic' | 'custom';
  /** API base URL */
  baseUrl: string;
  /** Model ID */
  model: string;
  /** API key (can use environment variable reference) */
  apiKey: string;
  /** Additional options */
  options?: Record<string, unknown>;
}

/**
 * Repository commit tracking
 */
export interface RepoCommits {
  /** Repository path (relative or absolute) */
  path: string;
  /** Remote URL (optional, for reference) */
  remote?: string;
  /** Commits to sync */
  commits: string[];
  /** Target branches to sync to */
  targetBranches: string[];
  /** Source branch (default: current branch) */
  sourceBranch?: string;
}

/**
 * Sync status for a single target
 */
export interface SyncStatus {
  /** Repository name */
  repo: string;
  /** Target branch */
  branch: string;
  /** Commit being synced */
  commit: string;
  /** Status */
  status: 'pending' | 'syncing' | 'conflict' | 'resolved' | 'success' | 'failed';
  /** Error message if failed */
  error?: string;
  /** Conflict details if any */
  conflict?: ConflictInfo;
  /** Resolution if AI resolved */
  resolution?: string;
}

/**
 * Conflict information
 */
export interface ConflictInfo {
  /** Files with conflicts */
  files: string[];
  /** Conflict content (file -> conflict markers) */
  content: Record<string, string>;
  /** AI suggested resolution */
  suggestedResolution?: string;
}

/**
 * Feature configuration
 */
export interface FeatureConfig {
  /** Feature name */
  name: string;
  /** Description */
  description?: string;
  /** AI configuration */
  ai?: AIConfig;
  /** Repository configurations */
  repos: Record<string, RepoCommits>;
  /** Created at */
  createdAt: string;
  /** Updated at */
  updatedAt: string;
}

/**
 * Project configuration (crossrepo.yaml)
 */
export interface ProjectConfig {
  /** Current feature */
  feature: string;
  /** AI configuration (global) */
  ai?: AIConfig;
  /** Repository configurations */
  repos: Record<string, RepoCommits>;
  /** Sync history */
  history?: SyncHistory[];
}

/**
 * Sync history entry
 */
export interface SyncHistory {
  /** Timestamp */
  timestamp: string;
  /** Feature name */
  feature: string;
  /** Results */
  results: SyncStatus[];
}

/**
 * Sync options
 */
export interface SyncOptions {
  /** Auto-resolve conflicts with AI */
  autoResolve: boolean;
  /** Dry run (don't make changes) */
  dryRun: boolean;
  /** Continue on error */
  continueOnError: boolean;
  /** Create branches if not exist */
  createBranch: boolean;
  /** Push after sync */
  push: boolean;
}

/**
 * AI resolution request
 */
export interface AIResolutionRequest {
  /** File path */
  filePath: string;
  /** Current branch content (ours) */
  ours: string;
  /** Incoming change content (theirs) */
  theirs: string;
  /** Base content (common ancestor) */
  base?: string;
  /** Commit message for context */
  commitMessage?: string;
  /** Branch context */
  branchContext?: string;
}

/**
 * AI resolution response
 */
export interface AIResolutionResponse {
  /** Resolved content */
  content: string;
  /** Explanation of resolution */
  explanation: string;
  /** Confidence level */
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Git operation result
 */
export interface GitResult {
  success: boolean;
  output?: string;
  error?: string;
  conflicts?: string[];
}

/**
 * Cherry-pick result
 */
export interface CherryPickResult {
  success: boolean;
  commit?: string;
  error?: string;
  conflicts?: ConflictInfo;
}

/**
 * Sync state for cleanup/rollback
 */
export interface SyncState {
  /** Repo name */
  repo: string;
  /** Branch name */
  branch: string;
  /** Stash reference if changes were stashed */
  stashRef?: string;
  /** Original branch before sync */
  originalBranch?: string;
}