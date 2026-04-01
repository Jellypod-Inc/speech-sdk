import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createWellSaid } from '../../providers/wellsaid/wellsaid-provider.js';

const hasKey = !!process.env.WELLSAID_API_KEY;

describe.skipIf(!hasKey)('WellSaid e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'wellsaid/default',
      text: TEST_TEXT,
      voice: '1',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const wellsaid = createWellSaid();
    const result = await generateSpeech({
      model: wellsaid(),
      text: TEST_TEXT,
      voice: '1',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
