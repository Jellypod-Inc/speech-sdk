import { describe, expect, it, vi } from "vitest";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";

describe("ResembleSpeechProvider.stream", () => {
  it("POSTs to /stream and returns streaming body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/wav" } }
      )
    );
    const provider = new ResembleSpeechProvider({
      apiKey: "rb-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "default",
      text: "hi",
      voice: "voice-uuid",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/stream");
    expect(result?.mediaType).toBe("audio/wav");
  });
});
