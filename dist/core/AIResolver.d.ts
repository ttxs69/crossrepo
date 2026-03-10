/**
 * @fileoverview AI-powered conflict resolution
 * @module crossrepo/core/AIResolver
 */
import { AIConfig, AIResolutionRequest, AIResolutionResponse } from '../types';
export declare class AIResolver {
    private config;
    private client;
    constructor(config: AIConfig);
    private initClient;
    private resolveApiKey;
    /**
     * Resolve a conflict using AI
     */
    resolveConflict(request: AIResolutionRequest): Promise<AIResolutionResponse>;
    private buildPrompt;
    /**
     * Batch resolve multiple conflicts
     */
    resolveMultiple(requests: AIResolutionRequest[]): Promise<Map<string, AIResolutionResponse>>;
    /**
     * Update configuration
     */
    updateConfig(config: Partial<AIConfig>): void;
    /**
     * Get current config
     */
    getConfig(): AIConfig;
    /**
     * Test AI connection
     */
    testConnection(): Promise<boolean>;
}
//# sourceMappingURL=AIResolver.d.ts.map