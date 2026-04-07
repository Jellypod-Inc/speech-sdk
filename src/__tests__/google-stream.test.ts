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
  it("streams base64 inlineData chunks via streamGenerateContent", async () => {
    const event = (data: string, mime: string) =>
      `data: ${JSON.stringify({
        candidates: [
          {
            content: {
              parts: [{ inlineData: { data, mimeType: mime } }],
            },
          },
        ],
      })}\n\n`;
    const sse =
      event("QUI=", "audio/L16;rate=24000") +
      event("Q0Q=", "audio/L16;rate=24000");
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
      modelId: "gemini-2.5-flash-preview-tts",
      text: "hi",
      voice: "Kore",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(":streamGenerateContent");
    expect(url).toContain("alt=sse");

    if (!result) {
      throw new Error("no result");
    }
    const decoded = await collect(result.stream);
    expect(new TextDecoder().decode(decoded)).toBe("ABCD");
    expect(result.mediaType).toBe("audio/L16;rate=24000");
  });
});
