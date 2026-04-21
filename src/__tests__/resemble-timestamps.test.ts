import { describe, expect, it, vi } from "vitest";
import { audioTimestampsToWordTimestamps } from "../providers/resemble/alignment.js";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";

describe("audioTimestampsToWordTimestamps", () => {
  it("aggregates graphemes into words on whitespace, keeping punctuation attached", () => {
    const out = audioTimestampsToWordTimestamps({
      graph_chars: [
        "H",
        "e",
        "l",
        "l",
        "o",
        ",",
        " ",
        "w",
        "o",
        "r",
        "l",
        "d",
        "!",
      ],
      graph_times: [
        [0, 0.05],
        [0.05, 0.1],
        [0.1, 0.15],
        [0.15, 0.2],
        [0.2, 0.28],
        [0.28, 0.32],
        [0.32, 0.35],
        [0.35, 0.4],
        [0.4, 0.45],
        [0.45, 0.5],
        [0.5, 0.55],
        [0.55, 0.6],
        [0.6, 0.65],
      ],
    });
    expect(out).toEqual([
      { text: "Hello,", start: 0, end: 0.32 },
      { text: "world!", start: 0.35, end: 0.65 },
    ]);
  });

  it("returns empty for empty input", () => {
    expect(
      audioTimestampsToWordTimestamps({ graph_chars: [], graph_times: [] })
    ).toEqual([]);
  });

  it("handles trailing whitespace without dropping the last word", () => {
    const out = audioTimestampsToWordTimestamps({
      graph_chars: ["H", "i", " "],
      graph_times: [
        [0, 0.1],
        [0.1, 0.2],
        [0.2, 0.25],
      ],
    });
    expect(out).toEqual([{ text: "Hi", start: 0, end: 0.2 }]);
  });

  it("skips graphemes with malformed timing tuples", () => {
    const out = audioTimestampsToWordTimestamps({
      graph_chars: ["H", "i"],
      graph_times: [[0, 0.1], []],
    });
    expect(out).toEqual([{ text: "H", start: 0, end: 0.1 }]);
  });

  it("preserves monotonic non-decreasing word starts", () => {
    const out = audioTimestampsToWordTimestamps({
      graph_chars: ["a", " ", "b", " ", "c"],
      graph_times: [
        [0, 0.1],
        [0.1, 0.15],
        [0.15, 0.25],
        [0.25, 0.3],
        [0.3, 0.4],
      ],
    });
    for (let i = 1; i < out.length; i++) {
      const cur = out[i];
      const prev = out[i - 1];
      if (cur && prev) {
        expect(cur.start).toBeGreaterThanOrEqual(prev.start);
      }
    }
  });
});

describe("ResembleSpeechProvider native timestamps", () => {
  function mockJsonResponse(body: Record<string, unknown>) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    });
  }

  it("returns word timestamps when includeTimestamps is true", async () => {
    const fetchFn = mockJsonResponse({
      audio_content: "AAEC",
      audio_timestamps: {
        graph_chars: ["H", "i", " ", "y", "o", "u"],
        graph_times: [
          [0, 0.1],
          [0.1, 0.2],
          [0.2, 0.25],
          [0.25, 0.3],
          [0.3, 0.4],
          [0.4, 0.5],
        ],
      },
    });

    const provider = new ResembleSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "default",
      text: "Hi you",
      voice: "v",
      includeTimestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Hi", start: 0, end: 0.2 },
      { text: "you", start: 0.25, end: 0.5 },
    ]);
  });

  it("omits timestamps when includeTimestamps is false even if API returns them", async () => {
    const fetchFn = mockJsonResponse({
      audio_content: "AAEC",
      audio_timestamps: {
        graph_chars: ["H", "i"],
        graph_times: [
          [0, 0.1],
          [0.1, 0.2],
        ],
      },
    });

    const provider = new ResembleSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "default",
      text: "Hi",
      voice: "v",
    });

    expect(result.timestamps).toBeUndefined();
  });

  it("omits timestamps when audio_timestamps is missing", async () => {
    const fetchFn = mockJsonResponse({ audio_content: "AAEC" });

    const provider = new ResembleSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "default",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
    });

    expect(result.timestamps).toBeUndefined();
  });
});
