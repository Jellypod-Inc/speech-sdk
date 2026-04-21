import { describe, expect, it, vi } from "vitest";
import { mergeWordTimestampMessages } from "../providers/cartesia/alignment.js";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";

describe("mergeWordTimestampMessages", () => {
  it("flattens multiple incremental messages into a single ordered list", () => {
    const out = mergeWordTimestampMessages([
      { words: ["Hello,"], start: [0], end: [0.42] },
      { words: ["world!"], start: [0.5], end: [0.95] },
    ]);
    expect(out).toEqual([
      { text: "Hello,", start: 0, end: 0.42 },
      { text: "world!", start: 0.5, end: 0.95 },
    ]);
  });

  it("truncates each message to its shortest array length", () => {
    const out = mergeWordTimestampMessages([
      { words: ["a", "b", "c"], start: [0, 0.2], end: [0.2, 0.5] },
    ]);
    expect(out.length).toBe(2);
  });

  it("returns empty for empty input", () => {
    expect(mergeWordTimestampMessages([])).toEqual([]);
  });
});

function sseStreamFrom(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const ev of events) {
        controller.enqueue(encoder.encode(`data: ${ev}\n\n`));
      }
      controller.close();
    },
  });
}

describe("CartesiaSpeechProvider native timestamps", () => {
  it("routes to /tts/sse with add_timestamps:true and raw PCM defaults", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        sseStreamFrom([
          JSON.stringify({ type: "chunk", data: "AAEC", done: false }),
          JSON.stringify({
            type: "timestamps",
            word_timestamps: { words: ["Hi"], start: [0], end: [0.2] },
            done: false,
          }),
          JSON.stringify({ type: "done", done: true }),
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const provider = new CartesiaSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "sonic-3",
      text: "Hi",
      voice: "voice-id",
      includeTimestamps: true,
    });

    const [url, init] = fetchFn.mock.calls[0] as [
      string,
      { body: string; headers: Record<string, string> },
    ];
    expect(url).toBe("https://api.cartesia.ai/tts/sse");
    const body = JSON.parse(init.body);
    expect(body.add_timestamps).toBe(true);
    expect(body.output_format).toEqual({
      container: "raw",
      encoding: "pcm_s16le",
      sample_rate: 24_000,
    });
    expect(result.mediaType).toBe("audio/wav");
    expect(result.timestamps).toEqual([{ text: "Hi", start: 0, end: 0.2 }]);
    // Wrapped PCM should start with RIFF header.
    expect(Array.from(result.audio.slice(0, 4))).toEqual([
      0x52, 0x49, 0x46, 0x46,
    ]);
  });

  it("concatenates audio chunks and merges multiple timestamp messages", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        sseStreamFrom([
          JSON.stringify({ type: "chunk", data: "AAEC", done: false }),
          JSON.stringify({
            type: "timestamps",
            word_timestamps: { words: ["Hello,"], start: [0], end: [0.42] },
            done: false,
          }),
          JSON.stringify({ type: "chunk", data: "AwQF", done: false }),
          JSON.stringify({
            type: "timestamps",
            word_timestamps: { words: ["world!"], start: [0.5], end: [0.95] },
            done: false,
          }),
          JSON.stringify({ type: "done", done: true }),
        ]),
        { status: 200, headers: { "Content-Type": "text/event-stream" } }
      )
    );

    const provider = new CartesiaSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "sonic-3",
      text: "Hello, world!",
      voice: "v",
      includeTimestamps: true,
    });

    // Audio is wrapped in a 44-byte WAV header + 6 bytes of PCM data.
    expect(result.audio.byteLength).toBe(44 + 6);
    expect(Array.from(result.audio.slice(44))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(result.timestamps).toEqual([
      { text: "Hello,", start: 0, end: 0.42 },
      { text: "world!", start: 0.5, end: 0.95 },
    ]);
  });

  it("returns undefined timestamps when SSE emits none", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        new Response(
          sseStreamFrom([
            JSON.stringify({ type: "chunk", data: "AAEC", done: false }),
            JSON.stringify({ type: "done", done: true }),
          ]),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        )
      );

    const provider = new CartesiaSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    const result = await provider.generate({
      modelId: "sonic-3",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
    });

    // Provider returns an empty array; generate-speech.ts coerces to
    // undefined before surfacing to callers.
    expect(result.timestamps).toEqual([]);
  });

  it("uses /tts/bytes when includeTimestamps is false", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]).buffer, {
        status: 200,
        headers: { "Content-Type": "audio/wav" },
      })
    );

    const provider = new CartesiaSpeechProvider({
      apiKey: "k",
      fetch: fetchFn,
    });
    await provider.generate({
      modelId: "sonic-3",
      text: "Hi",
      voice: "v",
    });

    const [url] = fetchFn.mock.calls[0] as [string];
    expect(url).toBe("https://api.cartesia.ai/tts/bytes");
  });
});
