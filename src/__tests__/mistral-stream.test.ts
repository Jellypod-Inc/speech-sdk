import { describe, expect, it, vi } from "vitest";
import { MistralSpeechProvider } from "../providers/mistral/index.js";

async function collect(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

describe("MistralSpeechProvider.stream", () => {
  it("decodes SSE speech.audio.delta events", async () => {
    const sse = [
      'data: {"event":"speech.audio.delta","data":{"audioData":"QUI="}}\n\n',
      'data: {"event":"speech.audio.delta","data":{"audioData":"Q0Q="}}\n\n',
      'data: {"event":"speech.audio.done","data":{"usage":{"tokens":10}}}\n\n',
    ].join("");
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(sse));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      )
    );

    const provider = new MistralSpeechProvider({
      apiKey: "ms-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "voxtral-mini-tts-2603",
      text: "hi",
      voice: "alice",
      providerOptions: { response_format: "mp3" },
    });

    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as RequestInit).body as string
    );
    expect(body.stream).toBe(true);

    expect(result?.mediaType).toBe("audio/mpeg");
    if (!result) {
      throw new Error("no result");
    }
    const decoded = await collect(result.stream);
    expect(new TextDecoder().decode(decoded)).toBe("ABCD");
  });
});
