import { describe, expect, it } from "vitest";
import { generateSpeech } from "../../generate-speech.js";
import { createSmallestAI } from "../../providers/smallest-ai/index.js";

const hasKey = !!process.env.SMALLEST_API_KEY;

describe.skipIf(!hasKey)("Smallest AI e2e", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  it("generates audio via factory", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI(),
      text: TEST_TEXT,
      voice: "magnus",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.base64.length).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("respects voice override", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI(),
      text: TEST_TEXT,
      voice: "olivia",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("accepts providerOptions for sample_rate and language", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI(),
      text: TEST_TEXT,
      voice: "magnus",
      providerOptions: { sample_rate: 24_000, language: "en" },
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("returns metadata with duration and latency", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI(),
      text: TEST_TEXT,
      voice: "magnus",
    });

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
  });
});

describe.skipIf(!hasKey)("Smallest AI e2e — lightning_v3.1_pro", () => {
  const TEST_TEXT = "Hello, this is a test of the speech SDK.";

  it("generates audio with default pro voice", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI("lightning_v3.1_pro"),
      text: TEST_TEXT,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
  });

  it("generates audio with an Indian pro voice", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI("lightning_v3.1_pro"),
      text: TEST_TEXT,
      voice: "aviraj",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("generates audio with a British pro voice", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI("lightning_v3.1_pro"),
      text: TEST_TEXT,
      voice: "benedict",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("generates audio with an American pro voice", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI("lightning_v3.1_pro"),
      text: TEST_TEXT,
      voice: "maverick",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("returns metadata with duration and latency", async () => {
    const smallestAI = createSmallestAI();
    const result = await generateSpeech({
      model: smallestAI("lightning_v3.1_pro"),
      text: TEST_TEXT,
      voice: "meher",
    });

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.inputChars).toBe(TEST_TEXT.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
  });
});
