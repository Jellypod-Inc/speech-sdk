import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createFishAudio } from '../../providers/fish-audio/fish-audio-provider.js';

const hasKey = !!process.env.FISH_AUDIO_API_KEY;

describe.skipIf(!hasKey)('Fish Audio e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'fish-audio/s2-pro',
      text: TEST_TEXT,
      voice: '59e9dc1cb20c452584788a2690c80970',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const fishAudio = createFishAudio();
    const result = await generateSpeech({
      model: fishAudio(),
      text: TEST_TEXT,
      voice: '59e9dc1cb20c452584788a2690c80970',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
