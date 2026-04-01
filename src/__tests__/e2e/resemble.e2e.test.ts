import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createResemble } from '../../providers/resemble/resemble-provider.js';

const hasKey = !!process.env.RESEMBLE_API_KEY;

describe.skipIf(!hasKey)('Resemble e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';
  const voice = process.env.RESEMBLE_VOICE_UUID ?? 'default';

  it('generates audio via string model identifier', async () => {
    const result = await generateSpeech({
      model: 'resemble/default',
      text: TEST_TEXT,
      voice,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it('generates audio via factory', async () => {
    const resemble = createResemble();
    const result = await generateSpeech({
      model: resemble(),
      text: TEST_TEXT,
      voice,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
});
