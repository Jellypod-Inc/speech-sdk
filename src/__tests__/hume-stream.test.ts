import { describe, expect, it, vi } from "vitest";
import { HumeSpeechProvider } from "../providers/hume/index.js";

describe("HumeSpeechProvider.stream", () => {
  it("POSTs to /tts/stream/file and returns streaming body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1, 2]));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/mpeg" } }
      )
    );
    const provider = new HumeSpeechProvider({
      apiKey: "hm-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    const result = await provider.stream?.({
      modelId: "octave-2",
      text: "hi",
      voice: "Ava",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/tts/stream/file");
    expect(result?.mediaType).toBe("audio/mpeg");
  });
});
