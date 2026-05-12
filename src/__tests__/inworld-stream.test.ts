import { describe, expect, it, vi } from "vitest";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

const VOICE_NOT_FOUND_PATTERN = /voice not found/;

function base64(bytes: number[]): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

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
    if (value) {
      chunks.push(value);
    }
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

describe("InworldSpeechProvider.stream", () => {
  it("calls the streaming endpoint with POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                `${JSON.stringify({ result: { audioContent: base64([1, 2]) } })}\n`
              )
            );
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "inworld-tts-1.5-max",
      text: "hi",
      voice: "Ashley",
    });

    expect(fetchMock.mock.calls[0][0] as string).toBe(
      "https://api.inworld.ai/tts/v1/voice:stream"
    );
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(result.mediaType).toBe("audio/mpeg");
    const bytes = await collect(result.stream);
    expect(bytes).toEqual(new Uint8Array([1, 2]));
  });

  it("decodes NDJSON chunks and concatenates audio bytes", async () => {
    const lines = [
      JSON.stringify({ result: { audioContent: base64([1, 2, 3]) } }),
      JSON.stringify({ audioContent: base64([4, 5]) }),
      JSON.stringify({ result: { audioContent: base64([6]) } }),
    ];
    const encoded = new TextEncoder().encode(`${lines.join("\n")}\n`);

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            // emit one chunk that contains a partial last line to also exercise buffering
            c.enqueue(encoded.slice(0, 30));
            c.enqueue(encoded.slice(30));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "inworld-tts-1.5-max",
      text: "hi",
      voice: "Ashley",
    });
    const bytes = await collect(result.stream);
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
  });

  it("propagates upstream API errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => '{"message":"upstream broken"}',
    });
    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.stream({
        modelId: "inworld-tts-1.5-max",
        text: "hi",
        voice: "Ashley",
      })
    ).rejects.toThrow();
  });

  it("emits a stream error when an NDJSON chunk contains an error field", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                `${JSON.stringify({ error: { message: "voice not found" } })}\n`
              )
            );
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "inworld-tts-1.5-max",
      text: "hi",
      voice: "Ashley",
    });

    await expect(collect(result.stream)).rejects.toThrow(
      VOICE_NOT_FOUND_PATTERN
    );
  });

  it("cancels the upstream fetch body when a parse error occurs", async () => {
    let upstreamCancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ error: { message: "voice not found" } })}\n`
          )
        );
        // Intentionally do not close — we want the upstream to stay open so
        // the only way it terminates is via cancel() from the parse error.
      },
      cancel() {
        upstreamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(upstream, {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "inworld-tts-1.5-max",
      text: "hi",
      voice: "Ashley",
    });

    await expect(collect(result.stream)).rejects.toThrow(
      VOICE_NOT_FOUND_PATTERN
    );
    expect(upstreamCancelled).toBe(true);
  });

  it("cancels the upstream fetch body when the consumer cancels", async () => {
    let upstreamCancelled = false;
    const upstream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(
          new TextEncoder().encode(
            `${JSON.stringify({ result: { audioContent: base64([1, 2]) } })}\n`
          )
        );
        // Leave open; consumer will cancel.
      },
      cancel() {
        upstreamCancelled = true;
      },
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(upstream, {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "inworld-tts-1.5-max",
      text: "hi",
      voice: "Ashley",
    });

    const reader = result.stream.getReader();
    await reader.read(); // consume one chunk
    await reader.cancel("consumer done");

    expect(upstreamCancelled).toBe(true);
  });

  it("streams audio for inworld-tts-2 and passes delivery_mode through", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              new TextEncoder().encode(
                `${JSON.stringify({ result: { audioContent: base64([9, 9]) } })}\n`
              )
            );
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const provider = new InworldSpeechProvider({
      apiKey: "iw-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "inworld-tts-2",
      text: "hi",
      voice: "Ashley",
      providerOptions: { delivery_mode: "STABLE" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model_id).toBe("inworld-tts-2");
    expect(body.delivery_mode).toBe("STABLE");
    const bytes = await collect(result.stream);
    expect(bytes).toEqual(new Uint8Array([9, 9]));
  });
});
