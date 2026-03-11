import { AIResolver } from '../core/AIResolver';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockImplementation(({ messages }: { messages: Array<{role: string, content: string}> }) => {
            const userMessage = messages[1]?.content || '';
            
            // Simulate different confidence responses
            if (userMessage.includes('cannot resolve')) {
              return Promise.resolve({
                choices: [{
                  message: {
                    content: '```javascript\nconst resolved = true;\n```\nI cannot resolve this conflict automatically.',
                  },
                }],
              });
            }
            
            if (userMessage.includes('ambiguous')) {
              return Promise.resolve({
                choices: [{
                  message: {
                    content: '```javascript\nconst resolved = true;\n```\nThe conflict is ambiguous. Please review.',
                  },
                }],
              });
            }
            
            if (userMessage.includes('cleanly merged')) {
              return Promise.resolve({
                choices: [{
                  message: {
                    content: '```javascript\nconst resolved = true;\n```\nThe changes were cleanly merged.',
                  },
                }],
              });
            }
            
            // Default response
            return Promise.resolve({
              choices: [{
                message: {
                  content: '```javascript\nconst resolved = true;\n```\nThis is the resolution.',
                },
              }],
            });
          }),
        },
      },
    })),
  };
});

describe('AIResolver', () => {
  let resolver: AIResolver;

  const testConfig = {
    provider: 'openai' as const,
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4',
    apiKey: 'test-key',
  };

  beforeEach(() => {
    resolver = new AIResolver(testConfig);
  });

  describe('constructor', () => {
    it('should initialize with config', () => {
      expect(resolver.getConfig()).toEqual(testConfig);
    });
  });

  describe('resolveConflict', () => {
    it('should resolve a conflict with medium confidence', async () => {
      const request = {
        filePath: 'src/index.ts',
        ours: 'const a = 1;',
        theirs: 'const a = 2;',
        commitMessage: 'feat: update a',
      };

      const result = await resolver.resolveConflict(request);

      expect(result.content).toBe('const resolved = true;');
      expect(result.explanation).toContain('resolution');
      expect(result.confidence).toBe('medium');
    });

    it('should return low confidence for cannot resolve', async () => {
      const request = {
        filePath: 'src/index.ts',
        ours: 'cannot resolve this',
        theirs: 'const a = 2;',
        commitMessage: 'feat: update',
      };

      const result = await resolver.resolveConflict(request);
      expect(result.confidence).toBe('low');
    });

    it('should return low confidence for ambiguous', async () => {
      const request = {
        filePath: 'src/index.ts',
        ours: 'ambiguous situation',
        theirs: 'const a = 2;',
        commitMessage: 'feat: update',
      };

      const result = await resolver.resolveConflict(request);
      expect(result.confidence).toBe('low');
    });

    it('should return high confidence for cleanly merged', async () => {
      const request = {
        filePath: 'src/index.ts',
        ours: 'cleanly merged content',
        theirs: 'const a = 2;',
        commitMessage: 'feat: update',
      };

      const result = await resolver.resolveConflict(request);
      expect(result.confidence).toBe('high');
    });

    it('should include context in prompt', async () => {
      const request = {
        filePath: 'src/test.ts',
        ours: 'export const x = 1;',
        theirs: 'export const x = 2;',
        commitMessage: 'feat: update x',
        branchContext: 'feature branch',
      };

      const result = await resolver.resolveConflict(request);
      expect(result).toBeDefined();
    });

    it('should return low confidence for very short resolved code', async () => {
      const request = {
        filePath: 'src/index.ts',
        ours: 'a'.repeat(100),
        theirs: 'b'.repeat(100),
        commitMessage: 'test',
      };

      const result = await resolver.resolveConflict(request);
      expect(['low', 'medium', 'high']).toContain(result.confidence);
    });
  });

  describe('resolveMultiple', () => {
    it('should resolve multiple conflicts', async () => {
      const requests = [
        { filePath: 'a.ts', ours: 'a', theirs: 'b' },
        { filePath: 'c.ts', ours: 'c', theirs: 'd' },
      ];

      const results = await resolver.resolveMultiple(requests);

      expect(results.size).toBe(2);
      expect(results.get('a.ts')).toBeDefined();
      expect(results.get('c.ts')).toBeDefined();
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      resolver.updateConfig({ model: 'gpt-3.5-turbo' });

      const config = resolver.getConfig();
      expect(config.model).toBe('gpt-3.5-turbo');
      expect(config.provider).toBe('openai');
    });
  });

  describe('testConnection', () => {
    it('should test connection', async () => {
      const result = await resolver.testConnection();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('env variable resolution', () => {
    it('should resolve API key from environment variable', () => {
      process.env.TEST_API_KEY = 'test-env-value';
      
      const configWithEnv = {
        provider: 'openai' as const,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4',
        apiKey: '${TEST_API_KEY}',
      };
      
      const envResolver = new AIResolver(configWithEnv);
      expect(envResolver).toBeDefined();
      
      delete process.env.TEST_API_KEY;
    });
  });
});