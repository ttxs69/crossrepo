import { AIResolver } from '../core/AIResolver';

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [
              {
                message: {
                  content: '```javascript\nconst resolved = true;\n```\nThis is the resolution.',
                },
              },
            ],
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
    it('should resolve a conflict', async () => {
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
      // With our mock, this should work
      expect(typeof result).toBe('boolean');
    });
  });
});