import { describe, it, expect } from 'vitest';
import { generateSpeech } from '../../generate-speech.js';
import { createGoogle } from '../../providers/google/index.js';

const hasKey = !!process.env.GOOGLE_API_KEY;

describe.skipIf(!hasKey)('Google (Gemini TTS) e2e', () => {
  const TEST_TEXT = 'Hello, this is a test of the speech SDK.';

  describe.each([
    'gemini-2.5-flash-preview-tts',
    'gemini-2.5-pro-preview-tts',
  ] as const)('model: %s', (modelId) => {
    it('generates audio via string model identifier', async () => {
      const result = await generateSpeech({
        model: `google/${modelId}`,
        text: TEST_TEXT,
        voice: 'Kore',
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it('generates audio via factory', async () => {
      const google = createGoogle();
      const result = await generateSpeech({
        model: google(modelId),
        text: TEST_TEXT,
        voice: 'Kore',
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });
});
