import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createFal } from '../../providers/fal/fal-provider.js';

const hasKey = !!process.env.FAL_API_KEY;

describe.skipIf(!hasKey)('fal e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'fal/fal-ai/kokoro/american-english',
      text: TEST_TEXT,
      voice: 'af_heart',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const fal = createFal();
    const result = await generateSpeech({
      model: fal('fal-ai/kokoro/american-english'),
      text: TEST_TEXT,
      voice: 'af_heart',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
