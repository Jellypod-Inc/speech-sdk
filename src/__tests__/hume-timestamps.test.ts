import { describe, expect, it, vi } from "vitest";
import { snippetsToWordTimestamps } from "../providers/hume/alignment.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";

describe("snippetsToWordTimestamps", () => {
  it("flattens nested snippet arrays and converts ms to seconds", () => {
    const out = snippetsToWordTimestamps([
      [
        {
          timestamps: [
            { text: "Hello", time: { begin: 0, end: 420 }, type: "word" },
            { text: "world", time: { begin: 500, end: 900 }, type: "word" },
          ],
        },
      ],
    ]);
    expect(out).toEqual([
      { text: "Hello", start: 0, end: 0.42 },
      { text: "world", start: 0.5, end: 0.9 },
    ]);
  });

  it("filters out phoneme-type entries", () => {
    const out = snippetsToWordTimestamps([
      [
        {
          timestamps: [
            { text: "Hi", time: { begin: 0, end: 200 }, type: "word" },
            { text: "h", time: { begin: 0, end: 50 }, type: "phoneme" },
            { text: "ay", time: { begin: 50, end: 200 }, type: "phoneme" },
          ],
        },
      ],
    ]);
    expect(out).toEqual([{ text: "Hi", start: 0, end: 0.2 }]);
  });

  it("returns empty for missing or empty inputs", () => {
    expect(snippetsToWordTimestamps([])).toEqual([]);
    expect(snippetsToWordTimestamps([[]])).toEqual([]);
    expect(snippetsToWordTimestamps([[{}]])).toEqual([]);
  });
});

describe("HumeSpeechProvider native timestamps", () => {
  function mockJsonResponse(body: Record<string, unknown>) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    });
  }

  it("routes to /v0/tts and sets word + split_utterances:false flags", async () => {
    const fetchFn = mockJsonResponse({
      generations: [
        {
          audio: "AAECAw==",
          snippets: [[{ timestamps: [] }]],
        },
      ],
    });

    const provider = new HumeSpeechProvider({ apiKey: "k", fetch: fetchFn });
    await provider.generate({
      modelId: "octave-2",
      text: "Hello",
      voice: "Kora",
      includeTimestamps: true,
    });

    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.hume.ai/v0/tts");
    const body = JSON.parse(init.body);
    expect(body.include_timestamp_types).toEqual(["word"]);
    expect(body.split_utterances).toBe(false);
    expect(body.version).toBe("2");
  });

  it("returns word timestamps from generations[0].snippets", async () => {
    const fetchFn = mockJsonResponse({
      generations: [
        {
          audio: "AAECAw==",
          snippets: [
            [
              {
                timestamps: [
                  { text: "Hi", time: { begin: 0, end: 200 }, type: "word" },
                  {
                    text: "there",
                    time: { begin: 250, end: 700 },
                    type: "word",
                  },
                ],
              },
            ],
          ],
        },
      ],
    });

    const provider = new HumeSpeechProvider({ apiKey: "k", fetch: fetchFn });
    const result = await provider.generate({
      modelId: "octave-2",
      text: "Hi there",
      voice: "Kora",
      includeTimestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Hi", start: 0, end: 0.2 },
      { text: "there", start: 0.25, end: 0.7 },
    ]);
    expect(result.audio.byteLength).toBe(4);
  });

  it("derives mediaType from format.type when timestamps requested", async () => {
    const fetchFn = mockJsonResponse({
      generations: [{ audio: "AAECAw==", snippets: [[]] }],
    });

    const provider = new HumeSpeechProvider({ apiKey: "k", fetch: fetchFn });
    const result = await provider.generate({
      modelId: "octave-2",
      text: "Hi",
      voice: "Kora",
      includeTimestamps: true,
      providerOptions: { format: { type: "pcm" } },
    });

    expect(result.mediaType).toBe("audio/pcm;rate=48000");
  });

  it("falls back to /v0/tts/file for octave-1 even with includeTimestamps", async () => {
    const audioBytes = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new HumeSpeechProvider({ apiKey: "k", fetch: audioBytes });
    const result = await provider.generate({
      modelId: "octave-1",
      text: "Hi",
      voice: "Kora",
      includeTimestamps: true,
    });

    const [url] = audioBytes.mock.calls[0] as [string];
    expect(url).toBe("https://api.hume.ai/v0/tts/file");
    expect(result.timestamps).toBeUndefined();
  });

  it("uses /v0/tts/file when includeTimestamps is false on octave-2", async () => {
    const audioBytes = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new HumeSpeechProvider({ apiKey: "k", fetch: audioBytes });
    await provider.generate({
      modelId: "octave-2",
      text: "Hi",
      voice: "Kora",
    });

    const [url] = audioBytes.mock.calls[0] as [string];
    expect(url).toBe("https://api.hume.ai/v0/tts/file");
  });
});
