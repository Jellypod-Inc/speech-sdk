import { describe, expect, it } from "vitest";
import { StreamingNotSupportedError } from "../../errors.js";
import { generateSpeech } from "../../generate-speech.js";
import { createFal } from "../../providers/fal/index.js";
import { streamSpeech } from "../../stream-speech.js";

const hasKey = !!process.env.FAL_API_KEY;

describe.skipIf(!hasKey)("fal e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";
  const fal = createFal();

  describe("kokoro/american-english", () => {
    it("generates audio", async () => {
      const result = await generateSpeech({
        model: fal("kokoro/american-english"),
        text: TEST_TEXT,
        voice: "af_heart",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });
  });

  describe("inworld-tts", () => {
    it("generates audio", async () => {
      const result = await generateSpeech({
        model: fal("inworld-tts"),
        text: TEST_TEXT,
        voice: "Craig (en)",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  describe("minimax/speech-02-hd", () => {
    it("generates audio", async () => {
      const result = await generateSpeech({
        model: fal("minimax/speech-02-hd"),
        text: TEST_TEXT,
        voice: "Friendly_Person",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  // Voice cloning models — require audio_url reference, tested with providerOptions
  describe("chatterbox/text-to-speech", () => {
    it("generates audio with reference voice URL", async () => {
      const result = await generateSpeech({
        model: fal("chatterbox/text-to-speech"),
        text: TEST_TEXT,
        voice: {
          url: "https://storage.googleapis.com/falserverless/example_inputs/reference_audio.wav",
        },
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  describe("lux-tts", () => {
    it("generates audio with reference voice URL", async () => {
      const result = await generateSpeech({
        model: fal("lux-tts"),
        text: TEST_TEXT,
        voice: {
          url: "https://storage.googleapis.com/falserverless/example_inputs/reference_audio.wav",
        },
        providerOptions: { prompt: TEST_TEXT },
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  describe("tada/3b/text-to-speech", () => {
    it("generates audio with reference voice URL", async () => {
      const result = await generateSpeech({
        model: fal("tada/3b/text-to-speech"),
        text: TEST_TEXT,
        voice: {
          url: "https://storage.googleapis.com/falserverless/example_inputs/reference_audio.wav",
        },
        providerOptions: { prompt: TEST_TEXT },
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  describe("tada/1b/text-to-speech", () => {
    it("generates audio with reference voice URL", async () => {
      const result = await generateSpeech({
        model: fal("tada/1b/text-to-speech"),
        text: TEST_TEXT,
        voice: {
          url: "https://storage.googleapis.com/falserverless/example_inputs/reference_audio.wav",
        },
        providerOptions: { prompt: TEST_TEXT },
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    });
  });

  describe("string model identifier", () => {
    it("generates audio via string", async () => {
      const result = await generateSpeech({
        model: "fal-ai/kokoro/american-english",
        text: TEST_TEXT,
        voice: "af_heart",
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
    });
  });

  it("rejects streaming with StreamingNotSupportedError", async () => {
    await expect(
      streamSpeech({
        model: "fal-ai/kokoro/american-english",
        text: TEST_TEXT,
        voice: "af_heart",
      })
    ).rejects.toBeInstanceOf(StreamingNotSupportedError);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "fal-ai/kokoro/american-english",
      text: TEST_TEXT,
      voice: "af_heart",
    });

    expect(result.metadata.provider).toBe("fal-ai");
    expect(result.metadata.model).toBe("kokoro/american-english");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
