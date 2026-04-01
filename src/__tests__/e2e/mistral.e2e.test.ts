import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createMistral } from '../../providers/mistral/index.js';

const hasKey = !!process.env.MISTRAL_API_KEY;

describe.skipIf(!hasKey)('Mistral e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'mistral/voxtral-mini-tts-2603',
      text: TEST_TEXT,
      voice: 'en_paul_neutral',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const mistral = createMistral();
    const result = await generateSpeech({
      model: mistral(),
      text: TEST_TEXT,
      voice: 'en_paul_neutral',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
