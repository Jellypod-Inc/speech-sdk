import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createSpeechify } from '../../providers/speechify/speechify-provider.js';

const hasKey = !!process.env.SPEECHIFY_API_KEY;

describe.skipIf(!hasKey)('Speechify e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'speechify/simba-multilingual',
      text: TEST_TEXT,
      voice: 'george',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const speechify = createSpeechify();
    const result = await generateSpeech({
      model: speechify(),
      text: TEST_TEXT,
      voice: 'george',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
