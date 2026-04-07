import { describe, expect, it, vi } from "vitest";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";

describe("DeepgramSpeechProvider.stream", () => {
  it("streams audio bytes from /speak", async () => {
    const payload = new Uint8Array([5, 6, 7]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(payload);
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/mpeg" } }
      )
    );
    const provider = new DeepgramSpeechProvider({
      apiKey: "dg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "aura-2",
      text: "hi",
      voice: "thalia",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/v1/speak?model=aura-2-thalia");
    expect(result.mediaType).toBe("audio/mpeg");
  });
});
