import { describe, it, expect } from 'vitest';
import { resolveModel } from '../resolve-provider.js';

describe('resolveModel', () => {
  it('throws for string model identifiers', () => {
    expect(() => resolveModel('openai/tts-1')).toThrow(
      'String model identifiers like "openai/tts-1" are not supported yet',
    );
  });

  it('throws with helpful message pointing to factory functions', () => {
    expect(() => resolveModel('openai/tts-1')).toThrow('createOpenAI');
  });

  it('throws for provider-only strings', () => {
    expect(() => resolveModel('elevenlabs')).toThrow(
      'String model identifiers',
    );
  });

  it('passes through ResolvedModel objects unchanged', () => {
    const mockProvider = {
      id: 'test',
      defaultModel: 'test-model',
      models: [],
      generate: async () => ({
        audio: new Uint8Array(),
        mediaType: 'audio/mpeg',
      }),
    };
    const resolved = { provider: mockProvider, modelId: 'custom-model' };
    const result = resolveModel(resolved);
    expect(result).toBe(resolved);
  });
});
