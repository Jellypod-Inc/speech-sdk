import { describe, it, expect } from 'vitest';
import { openaiSpeechOptionsSchema, type OpenAISpeechOptions } from '../providers/openai/openai-options.js';

describe('openaiSpeechOptionsSchema', () => {
  it('accepts valid options', () => {
    const options: OpenAISpeechOptions = {
      speed: 1.5,
      instructions: 'Speak cheerfully',
      outputFormat: 'wav',
    };
    const result = openaiSpeechOptionsSchema.parse(options);
    expect(result.speed).toBe(1.5);
    expect(result.instructions).toBe('Speak cheerfully');
    expect(result.outputFormat).toBe('wav');
  });

  it('accepts empty options', () => {
    const result = openaiSpeechOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects speed below 0.25', () => {
    expect(() =>
      openaiSpeechOptionsSchema.parse({ speed: 0.1 }),
    ).toThrow();
  });

  it('rejects speed above 4.0', () => {
    expect(() =>
      openaiSpeechOptionsSchema.parse({ speed: 5.0 }),
    ).toThrow();
  });

  it('accepts all valid output formats', () => {
    const formats = ['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'] as const;
    for (const fmt of formats) {
      const result = openaiSpeechOptionsSchema.parse({ outputFormat: fmt });
      expect(result.outputFormat).toBe(fmt);
    }
  });

  it('rejects invalid output format', () => {
    expect(() =>
      openaiSpeechOptionsSchema.parse({ outputFormat: 'ogg' }),
    ).toThrow();
  });
});
