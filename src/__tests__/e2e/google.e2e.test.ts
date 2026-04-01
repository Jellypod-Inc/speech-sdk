import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createGoogle } from '../../providers/google/google-provider.js';

const hasKey = !!process.env.GOOGLE_API_KEY;

describe.skipIf(!hasKey)('Google e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'google/default',
      text: TEST_TEXT,
      voice: 'en-US-Neural2-A',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const google = createGoogle();
    const result = await generateSpeech({
      model: google(),
      text: TEST_TEXT,
      voice: 'en-US-Neural2-A',
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
