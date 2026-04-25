import { describe, expect, it } from "vitest";
import { streamSpeech } from "../../stream-speech.js";
import {
  collectStreamAndSave,
  generateConversation,
  generateSpeech,
} from "./_save-audio.js";

const hasKey = !!process.env.SPEECH_GATEWAY_API_KEY;

describe.skipIf(!hasKey)("Speech Gateway e2e", () => {
  it("generateSpeech through gateway returns audio + timestamps", async () => {
    const result = await generateSpeech({
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello world from the gateway.",
      timestamps: "on",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
    expect(result.timestamps).toBeDefined();
    const words = result.timestamps ?? [];
    expect(words.length).toBeGreaterThan(0);
    for (const w of words) {
      expect(typeof w.text).toBe("string");
      expect(w.text.length).toBeGreaterThan(0);
      expect(typeof w.start).toBe("number");
      expect(typeof w.end).toBe("number");
      expect(w.end).toBeGreaterThanOrEqual(w.start);
    }
  });

  it("generateSpeech through gateway works without timestamps (binary path)", async () => {
    const result = await generateSpeech({
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello world from the gateway.",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
    expect(result.timestamps).toBeUndefined();
  });

  it("streamSpeech through gateway streams audio", async () => {
    const result = await streamSpeech({
      model: "openai/tts-1",
      voice: "alloy",
      text: "Streaming test.",
    });
    const bytes = await collectStreamAndSave(result);
    expect(bytes.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.mediaType).toMatch(/^audio\//);
  });
});

describe.skipIf(!hasKey)("generateConversation via gateway e2e", () => {
  it("3-turn conversation through gateway returns one mixed audio file", {
    timeout: 120_000,
  }, async () => {
    const result = await generateConversation({
      model: "openai/gpt-4o-mini-tts",
      turns: [
        { voice: "alloy", text: "Hi there." },
        { voice: "nova", text: "Hello back!" },
        { voice: "alloy", text: "How are you today?" },
      ],
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    // biome-ignore lint/performance/useTopLevelRegex: single-use test regex
    expect(result.audio.mediaType).toMatch(/^audio\//);
    expect(result.metadata.provider).toBe("speech-gateway");
    expect(result.metadata.model).toBe("openai/gpt-4o-mini-tts");

    // Default mode is "off", so the SDK doesn't even ask for timestamps.
    expect(result.timestamps).toBeUndefined();

    expect(result.providerMetadata).toBeDefined();
    const turns = (
      result.providerMetadata as
        | {
            turns?: readonly {
              provider: string;
              model: string;
              voice: string;
            }[];
          }
        | undefined
    )?.turns;
    expect(turns).toBeDefined();
    expect(turns?.length).toBe(3);

    // Phase 1 server behavior: empty warnings array is always present on
    // the wire, which the SDK collapses to undefined when there's nothing
    // to surface.
    expect(result.warnings).toBeUndefined();
  });

  it("timestamps: on through gateway returns per-turn-attributed words", {
    timeout: 180_000,
  }, async () => {
    const result = await generateConversation({
      model: "openai/gpt-4o-mini-tts",
      turns: [
        { voice: "alloy", text: "Hi there, my name is Alloy." },
        { voice: "nova", text: "And I am Nova, nice to meet you." },
        { voice: "alloy", text: "Great, let us get started." },
      ],
      timestamps: "on",
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.metadata.provider).toBe("speech-gateway");
    expect(result.metadata.model).toBe("openai/gpt-4o-mini-tts");

    expect(result.timestamps).toBeDefined();
    const words = result.timestamps ?? [];
    expect(words.length).toBeGreaterThan(0);

    const observedTurnIndices = new Set<number>();
    for (const w of words) {
      expect(typeof w.text).toBe("string");
      expect(w.text.length).toBeGreaterThan(0);
      expect(typeof w.start).toBe("number");
      expect(typeof w.end).toBe("number");
      expect(w.end).toBeGreaterThanOrEqual(w.start);
      expect(typeof w.turnIndex).toBe("number");
      expect(w.turnIndex).toBeGreaterThanOrEqual(0);
      expect(w.turnIndex).toBeLessThanOrEqual(2);
      observedTurnIndices.add(w.turnIndex);
    }
    // Every turn should have contributed at least one word.
    expect(observedTurnIndices.size).toBe(3);
  });
});
