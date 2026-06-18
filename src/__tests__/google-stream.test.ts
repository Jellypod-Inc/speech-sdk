import { describe, expect, it, vi } from "vitest";
import { GoogleSpeechProvider } from "../providers/google/index.js";

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

describe("GoogleSpeechProvider.stream", () => {
  // 2.5 TTS has no progressive streaming endpoint, so stream() delegates to
  // generate() and wraps the buffered WAV in a single-chunk ReadableStream.
  // 3.1+ streams for real via /interactions (covered separately below).

  it("delegates to generateContent and returns a single-chunk WAV stream", async () => {
    // 4 bytes of 16-bit PCM (2 samples of silence)
    const pcmBase64 = "AAAAAA==";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=24000",
                    data: pcmBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "hi",
      voice: "Kore",
    });

    // Should hit the non-streaming generateContent endpoint, not
    // streamGenerateContent.
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(":generateContent");
    expect(url).not.toContain(":streamGenerateContent");

    if (!result) {
      throw new Error("no result");
    }
    expect(result.mediaType).toBe("audio/wav");

    const decoded = await collect(result.stream);
    // 44-byte WAV header + 4 bytes of PCM
    expect(decoded.length).toBe(48);

    const riff = new TextDecoder().decode(decoded.slice(0, 4));
    expect(riff).toBe("RIFF");
    const wave = new TextDecoder().decode(decoded.slice(8, 12));
    expect(wave).toBe("WAVE");

    // WAV header sample rate field (offset 24, little-endian uint32)
    const view = new DataView(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength
    );
    expect(view.getUint32(24, true)).toBe(24_000);
  });

  it("streams gemini-3.1 via the /interactions endpoint as raw PCM chunks", async () => {
    // Two base64 PCM deltas: "QUI=" -> "AB", "Q0Q=" -> "CD"
    const sse = [
      'event: step.start\ndata: {"index":0,"step":{"type":"model_output"},"event_type":"step.start"}\n\n',
      'event: step.delta\ndata: {"index":0,"delta":{"mime_type":"audio/l16","data":"QUI="},"event_type":"step.delta"}\n\n',
      'event: step.delta\ndata: {"index":0,"delta":{"mime_type":"audio/l16","data":"Q0Q="},"event_type":"step.delta"}\n\n',
      'event: step.stop\ndata: {"index":0,"event_type":"step.stop"}\n\n',
      "event: done\ndata: [DONE]\n\n",
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

    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "hi",
      voice: "Kore",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/interactions");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
    expect(body.model).toBe("gemini-3.1-flash-tts-preview");
    expect(body.generation_config.speech_config).toEqual([{ voice: "Kore" }]);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "gg-test"
    );

    if (!result) {
      throw new Error("no result");
    }
    expect(result.mediaType).toBe("audio/pcm;rate=24000");

    const decoded = await collect(result.stream);
    // Raw PCM passthrough, no WAV header.
    expect(new TextDecoder().decode(decoded)).toBe("ABCD");
  });

  it("honors non-default sample rate from the response mimeType", async () => {
    // generate() parses the rate= parameter from inlineData.mimeType.
    // Since stream() delegates to generate(), it inherits this behavior.
    const pcmBase64 = "AAAAAA==";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=48000",
                    data: pcmBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "hi",
      voice: "Kore",
    });

    if (!result) {
      throw new Error("no result");
    }
    const decoded = await collect(result.stream);
    const view = new DataView(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength
    );
    expect(view.getUint32(24, true)).toBe(48_000);
  });
});
