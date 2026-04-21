import { describe, expect, it, vi } from "vitest";
import { wordAlignmentToWordTimestamps } from "../providers/inworld/alignment.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

describe("wordAlignmentToWordTimestamps", () => {
  it("zips parallel arrays into WordTimestamp entries (already in seconds)", () => {
    const out = wordAlignmentToWordTimestamps({
      words: ["Hello,", "world,", "this", "will", "be", "saved"],
      wordStartTimeSeconds: [0, 0.28, 0.96, 1.25, 1.38, 1.5],
      wordEndTimeSeconds: [0.28, 0.8, 1.25, 1.38, 1.5, 1.99],
    });
    expect(out).toEqual([
      { text: "Hello,", start: 0, end: 0.28 },
      { text: "world,", start: 0.28, end: 0.8 },
      { text: "this", start: 0.96, end: 1.25 },
      { text: "will", start: 1.25, end: 1.38 },
      { text: "be", start: 1.38, end: 1.5 },
      { text: "saved", start: 1.5, end: 1.99 },
    ]);
  });

  it("truncates to the shortest array length", () => {
    const out = wordAlignmentToWordTimestamps({
      words: ["a", "b", "c"],
      wordStartTimeSeconds: [0, 0.2],
      wordEndTimeSeconds: [0.2, 0.5],
    });
    expect(out.length).toBe(2);
  });

  it("returns empty for empty arrays", () => {
    expect(
      wordAlignmentToWordTimestamps({
        words: [],
        wordStartTimeSeconds: [],
        wordEndTimeSeconds: [],
      })
    ).toEqual([]);
  });
});

describe("InworldSpeechProvider native timestamps", () => {
  function mockJsonResponse(body: Record<string, unknown>) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    });
  }

  it("sends timestamp_type:'WORD' when includeTimestamps is true", async () => {
    const fetchFn = mockJsonResponse({
      audioContent: "AAEC",
      timestampInfo: {
        wordAlignment: {
          words: ["Hi"],
          wordStartTimeSeconds: [0],
          wordEndTimeSeconds: [0.2],
        },
      },
    });

    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
      includeTimestamps: true,
    });

    const [, init] = fetchFn.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    const body = JSON.parse(init.body);
    expect(body.timestamp_type).toBe("WORD");
    expect(body.model_id).toBe("inworld-tts-1.5-max");
    expect(body.voice_id).toBe("Ashley");
  });

  it("returns word timestamps from timestampInfo.wordAlignment", async () => {
    const fetchFn = mockJsonResponse({
      audioContent: "AAEC",
      timestampInfo: {
        wordAlignment: {
          words: ["Hello", "world"],
          wordStartTimeSeconds: [0, 0.5],
          wordEndTimeSeconds: [0.42, 0.9],
        },
      },
    });

    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "inworld-tts-1.5-mini",
      text: "Hello world",
      voice: "Ashley",
      includeTimestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Hello", start: 0, end: 0.42 },
      { text: "world", start: 0.5, end: 0.9 },
    ]);
  });

  it("omits timestamp_type when includeTimestamps is false", async () => {
    const fetchFn = mockJsonResponse({ audioContent: "AAEC" });

    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
    });

    const [, init] = fetchFn.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body);
    expect(body.timestamp_type).toBeUndefined();
    expect(result.timestamps).toBeUndefined();
  });

  it("omits timestamps when wordAlignment is missing from response", async () => {
    const fetchFn = mockJsonResponse({ audioContent: "AAEC" });

    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
      includeTimestamps: true,
    });

    expect(result.timestamps).toBeUndefined();
  });
});
