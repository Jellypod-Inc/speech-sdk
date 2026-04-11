import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStream } from "./_collect-stream.js";

const TEST_TEXT = "Hello, this is a test of the speech SDK.";
// ElevenLabs default "George" voice — replace if this voice ID expires
const VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

describe("ElevenLabs e2e", () => {
  describe.each([
    "eleven_v3",
    "eleven_multilingual_v2",
    "eleven_flash_v2_5",
    "eleven_flash_v2",
  ] as const)("model: %s", (modelId) => {
    it("generates audio via string model identifier", async () => {
      const result = await generateSpeech({
        model: `elevenlabs/${modelId}`,
        text: TEST_TEXT,
        voice: VOICE,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.audio.base64.length).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });

    it("generates audio via createElevenLabs factory", async () => {
      const elevenlabs = createElevenLabs();
      const result = await generateSpeech({
        model: elevenlabs(modelId),
        text: TEST_TEXT,
        voice: VOICE,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
      expect(result.audio.mediaType).toMatch(/^audio\//);
    });
  });

  it("uses default model when none specified", async () => {
    const elevenlabs = createElevenLabs();
    const result = await generateSpeech({
      model: elevenlabs(),
      text: TEST_TEXT,
      voice: VOICE,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("returns providerMetadata with requestId", async () => {
    const result = await generateSpeech({
      model: "elevenlabs/eleven_flash_v2",
      text: TEST_TEXT,
      voice: VOICE,
    });

    expect(result.providerMetadata).toBeDefined();
    expect(result.providerMetadata?.requestId).toEqual(expect.any(String));
  });

  it("respects abort signal", async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      generateSpeech({
        model: "elevenlabs/eleven_flash_v2",
        text: TEST_TEXT,
        voice: VOICE,
        abortSignal: controller.signal,
        maxRetries: 0,
      })
    ).rejects.toThrow();
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: "elevenlabs/eleven_flash_v2",
      text: TEST_TEXT,
      voice: VOICE,
    });
    const bytes = await collectStream(result.audio);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });

  it("passes output_format as query parameter", async () => {
    const result = await generateSpeech({
      model: "elevenlabs/eleven_flash_v2",
      text: TEST_TEXT,
      voice: VOICE,
      providerOptions: { output_format: "mp3_44100_128" },
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("returns metadata with duration", async () => {
    const result = await generateSpeech({
      model: "elevenlabs/eleven_flash_v2",
      text: TEST_TEXT,
      voice: VOICE,
    });

    expect(result.metadata.provider).toBe("elevenlabs");
    expect(result.metadata.model).toBe("eleven_flash_v2");
    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
    expect(result.metadata.ttfbMs).toBeUndefined();
  });
});
