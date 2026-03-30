import { describe, it, expect } from 'vitest';
import {
  elevenlabsSpeechOptionsSchema,
  type ElevenLabsSpeechOptions,
} from '../providers/elevenlabs/elevenlabs-options.js';

describe('elevenlabsSpeechOptionsSchema', () => {
  it('accepts valid options', () => {
    const options: ElevenLabsSpeechOptions = {
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.8,
        style: 0.3,
        speed: 1.2,
        useSpeakerBoost: true,
      },
      previousRequestIds: ['req-1', 'req-2'],
      nextRequestIds: ['req-3'],
      previousText: 'previous paragraph',
      nextText: 'next paragraph',
      seed: 42,
      languageCode: 'en',
      outputFormat: 'mp3_44100_128',
      applyTextNormalization: 'auto',
    };
    const result = elevenlabsSpeechOptionsSchema.parse(options);
    expect(result.voiceSettings?.stability).toBe(0.5);
    expect(result.previousRequestIds).toEqual(['req-1', 'req-2']);
  });

  it('accepts empty options', () => {
    const result = elevenlabsSpeechOptionsSchema.parse({});
    expect(result).toEqual({});
  });

  it('rejects stability outside 0-1', () => {
    expect(() =>
      elevenlabsSpeechOptionsSchema.parse({
        voiceSettings: { stability: 1.5 },
      }),
    ).toThrow();
  });

  it('rejects more than 3 previousRequestIds', () => {
    expect(() =>
      elevenlabsSpeechOptionsSchema.parse({
        previousRequestIds: ['a', 'b', 'c', 'd'],
      }),
    ).toThrow();
  });

  it('rejects invalid applyTextNormalization value', () => {
    expect(() =>
      elevenlabsSpeechOptionsSchema.parse({
        applyTextNormalization: 'invalid',
      }),
    ).toThrow();
  });

  it('rejects seed outside valid range', () => {
    expect(() =>
      elevenlabsSpeechOptionsSchema.parse({ seed: -1 }),
    ).toThrow();
  });
});
