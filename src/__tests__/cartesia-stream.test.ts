import { describe, expect, it, vi } from "vitest";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";

describe("CartesiaSpeechProvider.stream", () => {
  it("streams audio from /tts/bytes", async () => {
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
    const provider = new CartesiaSpeechProvider({
      apiKey: "ct-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "sonic-3",
      text: "hi",
      voice: "voice-id",
    });

    expect(fetchMock.mock.calls[0][0] as string).toContain("/tts/bytes");
    expect(result?.mediaType).toBe("audio/wav");
  });
});
