import { describe, expect, it } from "vitest";
import { parseSseBase64Stream } from "../sse-stream.js";

function toStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
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
    chunks.push(value);
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

describe("parseSseBase64Stream", () => {
  it("decodes base64 audio chunks from SSE events", async () => {
    const sse = toStream([
      'data: {"audioData":"QUI="}\n\n',
      'data: {"audioData":"Q0Q="}\n\n',
      "data: [DONE]\n\n",
    ]);

    const { stream } = parseSseBase64Stream(sse, {
      extractBase64: (event) => {
        if (event === "[DONE]") {
          return null;
        }
        const json = JSON.parse(event);
        return typeof json.audioData === "string" ? json.audioData : null;
      },
    });

    const bytes = await collect(stream);
    expect(new TextDecoder().decode(bytes)).toBe("ABCD");
  });

  it("handles chunks split across read boundaries", async () => {
    const sse = toStream([
      'data: {"aud',
      'ioData":"QUI="}\n',
      "\ndata: ",
      '{"audioData":"Q0Q="}\n\n',
    ]);

    const { stream } = parseSseBase64Stream(sse, {
      extractBase64: (event) => {
        const json = JSON.parse(event);
        return typeof json.audioData === "string" ? json.audioData : null;
      },
    });

    const bytes = await collect(stream);
    expect(new TextDecoder().decode(bytes)).toBe("ABCD");
  });

  it("resolves metadata promise from terminal event", async () => {
    const sse = toStream([
      'data: {"audioData":"QUI="}\n\n',
      'data: {"done":true,"usage":{"tokens":42}}\n\n',
    ]);

    const { stream, metadata } = parseSseBase64Stream(sse, {
      extractBase64: (event) => {
        const json = JSON.parse(event);
        return typeof json.audioData === "string" ? json.audioData : null;
      },
      extractMetadata: (event) => {
        const json = JSON.parse(event);
        return json.done === true
          ? (json.usage as Record<string, unknown>)
          : null;
      },
    });

    await collect(stream);
    expect(await metadata).toEqual({ tokens: 42 });
  });
});
