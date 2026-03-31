import { describe, it, expect } from 'vitest';
import { resolveModel } from '../resolve-provider.js';

describe('resolveModel', () => {
  it('resolves provider/model string', () => {
    const result = resolveModel('openai/tts-1');
    expect(result.modelId).toBe('tts-1');
    expect(result.provider.id).toBe('openai');
  });

  it('resolves provider-only string with default model', () => {
    const result = resolveModel('openai');
    expect(result.provider.id).toBe('openai');
    expect(result.modelId).toBe('gpt-4o-mini-tts');
  });

  it('resolves elevenlabs provider', () => {
    const result = resolveModel('elevenlabs/eleven_flash_v2_5');
    expect(result.provider.id).toBe('elevenlabs');
    expect(result.modelId).toBe('eleven_flash_v2_5');
  });

  it('throws for unknown provider', () => {
    expect(() => resolveModel('unknown/model')).toThrow('Unknown provider: unknown');
  });

  it('passes through ResolvedModel objects unchanged', () => {
    const mockProvider = {
      id: 'test',
      defaultModel: 'test-model',
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
