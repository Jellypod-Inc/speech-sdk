import { describe, expect, it, vi } from "vitest";
import { GradiumSpeechProvider } from "../providers/gradium/index.js";

describe("GradiumSpeechProvider.stream", () => {
  it("returns response body bytes as a ReadableStream", async () => {
    const payload = new Uint8Array([5, 6, 7]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(payload);
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/wav" } }
      )
    );
    const provider = new GradiumSpeechProvider({
      apiKey: "gradium-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "default",
      text: "hi",
      voice: "cLONiZ4hQ8VpQ4Sz",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.mediaType).toBe("audio/wav");
    expect(result.stream).toBeInstanceOf(ReadableStream);
  });
});
