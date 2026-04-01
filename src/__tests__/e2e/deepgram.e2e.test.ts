import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createDeepgram } from '../../providers/deepgram/deepgram-provider.js';

const hasKey = !!process.env.DEEPGRAM_API_KEY;

describe.skipIf(!hasKey)('Deepgram e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'deepgram/aura-2',
      text: TEST_TEXT,
      voice: 'thalia-en',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const deepgram = createDeepgram();
    const result = await generateSpeech({
      model: deepgram(),
      text: TEST_TEXT,
      voice: 'thalia-en',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
