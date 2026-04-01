import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createLMNT } from '../../providers/lmnt/lmnt-provider.js';

const hasKey = !!process.env.LMNT_API_KEY;

describe.skipIf(!hasKey)('LMNT e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'lmnt/blizzard',
      text: TEST_TEXT,
      voice: 'lily',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const lmnt = createLMNT();
    const result = await generateSpeech({
      model: lmnt(),
      text: TEST_TEXT,
      voice: 'lily',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
