import { describe, expect, it } from "vitest";
import { createElevenLabs } from "../../providers/elevenlabs/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const TEST_TEXT = "Hello, this is a test of the speech SDK.";
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
    const bytes = await collectStreamAndSave(result);
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

  describe("timestamps (native /with-timestamps)", () => {
    it("returns word timestamps on the timestamps:on", async () => {
      const result = await generateSpeech({
        model: "elevenlabs/eleven_flash_v2",
        text: TEST_TEXT,
        voice: VOICE,
        timestamps: true,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeDefined();
      const words = result.timestamps ?? [];
      expect(words.length).toBeGreaterThan(0);
      for (const w of words) {
        expect(w.text.length).toBeGreaterThan(0);
        expect(typeof w.start).toBe("number");
        expect(typeof w.end).toBe("number");
        expect(w.end).toBeGreaterThanOrEqual(w.start);
      }
      for (let i = 1; i < words.length; i++) {
        expect(words[i]?.start).toBeGreaterThanOrEqual(
          words[i - 1]?.start ?? 0
        );
      }
      const lastEndMs = (words.at(-1)?.end ?? 0) * 1000;
      const durMs = result.metadata.audioDurationMs ?? 0;
      expect(Math.abs(lastEndMs - durMs)).toBeLessThan(500);
    });

    it("off mode suppresses timestamps even on a native model", async () => {
      const result = await generateSpeech({
        model: "elevenlabs/eleven_flash_v2",
        text: TEST_TEXT,
        voice: VOICE,
        timestamps: false,
      });

      expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
      expect(result.timestamps).toBeUndefined();
    });
  });
});
