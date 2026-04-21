import { describe, expect, it, vi } from "vitest";
import { wordDurationsToWordTimestamps } from "../providers/murf/alignment.js";
import { MurfSpeechProvider } from "../providers/murf/index.js";

describe("wordDurationsToWordTimestamps", () => {
  it("converts ms to seconds and projects to {text, start, end}", () => {
    const out = wordDurationsToWordTimestamps([
      { word: "Hello", startMs: 0, endMs: 420 },
      { word: "world", startMs: 500, endMs: 900 },
    ]);
    expect(out).toEqual([
      { text: "Hello", start: 0, end: 0.42 },
      { text: "world", start: 0.5, end: 0.9 },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(wordDurationsToWordTimestamps([])).toEqual([]);
  });

  it("preserves monotonic non-decreasing starts", () => {
    const out = wordDurationsToWordTimestamps([
      { word: "a", startMs: 0, endMs: 100 },
      { word: "b", startMs: 100, endMs: 250 },
      { word: "c", startMs: 250, endMs: 400 },
    ]);
    for (let i = 1; i < out.length; i++) {
      const cur = out[i];
      const prev = out[i - 1];
      if (cur && prev) {
        expect(cur.start).toBeGreaterThanOrEqual(prev.start);
      }
    }
  });

  it("ignores extra fields like pitchScale and sourceWordIndex", () => {
    const out = wordDurationsToWordTimestamps([
      {
        word: "Hi",
        startMs: 0,
        endMs: 200,
        pitchScaleMaximum: 1.2,
        pitchScaleMinimum: 0.8,
        sourceWordIndex: 0,
      },
    ]);
    expect(out[0]).toEqual({ text: "Hi", start: 0, end: 0.2 });
  });
});

describe("MurfSpeechProvider native timestamps", () => {
  const mockJsonResponse = (body: Record<string, unknown>) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    });

  it("returns word timestamps when includeTimestamps is true", async () => {
    const fetchFn = mockJsonResponse({
      encodedAudio: "AAEC",
      audioLengthInSeconds: 0.9,
      wordDurations: [
        { word: "Hello", startMs: 0, endMs: 420 },
        { word: "world", startMs: 500, endMs: 900 },
      ],
    });

    const provider = new MurfSpeechProvider({ apiKey: "k", fetch: fetchFn });
    const result = await provider.generate({
      modelId: "GEN2",
      text: "Hello world",
      voice: "en-US-natalie",
      includeTimestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Hello", start: 0, end: 0.42 },
      { text: "world", start: 0.5, end: 0.9 },
    ]);
    expect(result.audioDurationMs).toBe(900);
  });

  it("omits timestamps when includeTimestamps is false even if API returns them", async () => {
    const fetchFn = mockJsonResponse({
      encodedAudio: "AAEC",
      audioLengthInSeconds: 0.9,
      wordDurations: [{ word: "Hello", startMs: 0, endMs: 420 }],
    });

    const provider = new MurfSpeechProvider({ apiKey: "k", fetch: fetchFn });
    const result = await provider.generate({
      modelId: "GEN2",
      text: "Hello",
      voice: "en-US-natalie",
    });

    expect(result.timestamps).toBeUndefined();
  });

  it("omits timestamps when API returns no wordDurations", async () => {
    const fetchFn = mockJsonResponse({ encodedAudio: "AAEC" });

    const provider = new MurfSpeechProvider({ apiKey: "k", fetch: fetchFn });
    const result = await provider.generate({
      modelId: "GEN2",
      text: "Hello",
      voice: "en-US-natalie",
      includeTimestamps: true,
    });

    expect(result.timestamps).toBeUndefined();
  });

  it("populates audioDurationMs from audioLengthInSeconds", async () => {
    const fetchFn = mockJsonResponse({
      encodedAudio: "AAEC",
      audioLengthInSeconds: 1.234,
    });

    const provider = new MurfSpeechProvider({ apiKey: "k", fetch: fetchFn });
    const result = await provider.generate({
      modelId: "GEN2",
      text: "Hello",
      voice: "en-US-natalie",
    });

    expect(result.audioDurationMs).toBe(1234);
  });
});
