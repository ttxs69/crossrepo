/**
 * @fileoverview AI-powered conflict resolution
 * @module crossrepo/core/AIResolver
 */

import OpenAI from 'openai';
import { AIConfig, AIResolutionRequest, AIResolutionResponse } from '../types';

export class AIResolver {
  private config: AIConfig;
  private client: OpenAI | null = null;

  constructor(config: AIConfig) {
    this.config = config;
    this.initClient();
  }

  private initClient(): void {
    if (this.config.provider === 'openai' || this.config.provider === 'custom') {
      this.client = new OpenAI({
        apiKey: this.resolveApiKey(this.config.apiKey),
        baseURL: this.config.baseUrl,
      });
    }
  }

  private resolveApiKey(key: string): string {
    // Support environment variable references like ${OPENAI_API_KEY}
    const envMatch = key.match(/\$\{(.+?)\}/);
    if (envMatch) {
      return process.env[envMatch[1]] || key;
    }
    return key;
  }

  /**
   * Resolve a conflict using AI
   */
  async resolveConflict(request: AIResolutionRequest): Promise<AIResolutionResponse> {
    const prompt = this.buildPrompt(request);
    
    try {
      if (!this.client) {
        throw new Error('AI client not initialized');
      }

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert at resolving Git merge conflicts. Your task is to intelligently merge two versions of code, preserving the intent and functionality of both changes.

Rules:
1. Preserve the functionality from both versions when possible
2. Keep the code clean and maintainable
3. If changes are conflicting, prefer the more complete/recent implementation
4. Maintain consistent code style
5. Return ONLY the resolved code, no explanations in the code block
6. After the code, briefly explain your resolution decision`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content || '';
      
      // Extract code and explanation
      const codeMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
      const resolvedCode = codeMatch ? codeMatch[1].trim() : content;
      
      // Extract explanation (text after code block or non-code content)
      const explanationMatch = content.match(/```\s*[\s\S]*?\n(.+)$/s);
      const explanation = explanationMatch ? explanationMatch[1].trim() : 'AI resolved the conflict';

      // Determine confidence based on content analysis
      const confidence = this.determineConfidence(request, resolvedCode, explanation);

      return {
        content: resolvedCode,
        explanation,
        confidence,
      };
    } catch (error) {
      throw new Error(`AI resolution failed: ${error}`);
    }
  }

  private buildPrompt(request: AIResolutionRequest): string {
    let prompt = `Resolve the following Git conflict for file: ${request.filePath}

`;
    
    if (request.commitMessage) {
      prompt += `Context: This change is part of a commit with message: "${request.commitMessage}"

`;
    }

    if (request.branchContext) {
      prompt += `Branch context: ${request.branchContext}

`;
    }

    prompt += `=== CURRENT BRANCH VERSION (ours) ===
${request.ours}

=== INCOMING CHANGE VERSION (theirs) ===
${request.theirs}
`;

    if (request.base) {
      prompt += `
=== COMMON ANCESTOR (base) ===
${request.base}
`;
    }

    prompt += `
Please provide the resolved version that properly merges both changes. Return the result in a code block.`;

    return prompt;
  }

  /**
   * Batch resolve multiple conflicts
   */
  async resolveMultiple(
    requests: AIResolutionRequest[]
  ): Promise<Map<string, AIResolutionResponse>> {
    const results = new Map<string, AIResolutionResponse>();

    for (const request of requests) {
      try {
        const resolution = await this.resolveConflict(request);
        results.set(request.filePath, resolution);
      } catch (error) {
        console.error(`Failed to resolve ${request.filePath}: ${error}`);
      }
    }

    return results;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AIConfig>): void {
    this.config = { ...this.config, ...config };
    this.initClient();
  }

  /**
   * Get current config
   */
  getConfig(): AIConfig {
    return this.config;
  }

  /**
   * Test AI connection
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'Say "OK" if you can hear me.' }],
        max_tokens: 5,
      });

      return response.choices[0]?.message?.content?.includes('OK') || false;
    } catch {
      return false;
    }
  }

  /**
   * Determine confidence level for resolution
   */
  private determineConfidence(
    request: AIResolutionRequest,
    resolvedCode: string,
    explanation: string
  ): 'high' | 'medium' | 'low' {
    // Low confidence indicators
    const lowConfidenceSignals = [
      /cannot (resolve|determine|merge)/i,
      /ambiguous/i,
      /unclear/i,
      /unable to/i,
      /not sure/i,
      /might need/i,
      /please (review|verify|check)/i,
    ];

    // High confidence indicators
    const highConfidenceSignals = [
      /cleanly merged/i,
      /straightforward/i,
      /no conflict/i,
      /successfully (merged|combined|integrated)/i,
    ];

    // Check for low confidence signals
    for (const signal of lowConfidenceSignals) {
      if (signal.test(explanation)) {
        return 'low';
      }
    }

    // Check for high confidence signals
    for (const signal of highConfidenceSignals) {
      if (signal.test(explanation)) {
        return 'high';
      }
    }

    // Check if resolved code is very different from both inputs
    const oursLen = request.ours.length;
    const theirsLen = request.theirs.length;
    const resolvedLen = resolvedCode.length;
    
    // If resolved code is suspiciously different (very short or very long)
    if (resolvedLen < Math.min(oursLen, theirsLen) * 0.3) {
      return 'low'; // Resolved code seems too short
    }
    if (resolvedLen > (oursLen + theirsLen) * 1.5) {
      return 'low'; // Resolved code seems bloated
    }

    // Default to medium confidence
    return 'medium';
  }
}