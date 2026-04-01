import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createMurf } from '../../providers/murf/murf-provider.js';

const hasKey = !!process.env.MURF_API_KEY;

describe.skipIf(!hasKey)('Murf e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'murf/GEN2',
      text: TEST_TEXT,
      voice: 'en-US-natalie',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const murf = createMurf();
    const result = await generateSpeech({
      model: murf(),
      text: TEST_TEXT,
      voice: 'en-US-natalie',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
