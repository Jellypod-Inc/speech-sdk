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
  // Gemini's streamGenerateContent endpoint buffers the full synthesis
  // server-side, so our stream() delegates to generate() and wraps the
  // resulting WAV in a single-chunk ReadableStream. These tests assert
  // that behavior.

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
