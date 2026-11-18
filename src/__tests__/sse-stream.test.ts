import { describe, expect, it, vi } from "vitest";
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

  it("handles CRLF event separators", async () => {
    const sse = toStream([
      'data: {"audioData":"QUI="}\r\n\r\n',
      'data: {"audioData":"Q0Q="}\r\n\r\n',
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

  it("forwards consumer cancellation to the source", async () => {
    const cancel = vi.fn();
    const source = new ReadableStream<Uint8Array>({ cancel });
    const { stream } = parseSseBase64Stream(source, {
      extractBase64: () => null,
    });

    await stream.cancel("stopped");
    expect(cancel).toHaveBeenCalledWith("stopped");
  });

  it("cancels the source when event handling throws, after delivering parsed audio", async () => {
    const cancel = vi.fn();
    const failure = new Error("bad event");
    const encoder = new TextEncoder();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"audioData":"QUI="}\n\n'));
        controller.enqueue(encoder.encode("data: bad\n\n"));
      },
      cancel,
    });
    const { stream } = parseSseBase64Stream(source, {
      extractBase64: (event) => {
        if (event === "bad") {
          throw failure;
        }
        return JSON.parse(event).audioData;
      },
    });
    const reader = stream.getReader();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(cancel).toHaveBeenCalledWith(failure);
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("AB");
    await expect(reader.read()).rejects.toBe(failure);
  });

  it("errors the stream when onEnd throws", async () => {
    const { stream } = parseSseBase64Stream(
      toStream(['data: {"audioData":"QUI="}\n\n']),
      {
        extractBase64: (event) => JSON.parse(event).audioData,
        onEnd: () => {
          throw new Error("truncated");
        },
      }
    );

    await expect(collect(stream)).rejects.toThrow("truncated");
  });
});
