import { describe, expect, it, vi } from "vitest";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";

describe("FishAudioSpeechProvider.stream", () => {
  it("streams audio from /v1/tts", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/mpeg" } }
      )
    );
    const provider = new FishAudioSpeechProvider({
      apiKey: "fa-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "s2-pro",
      text: "hi",
      voice: "ref-voice",
    });
    expect(result?.mediaType).toBe("audio/mpeg");
    expect(fetchMock.mock.calls[0][0] as string).toContain("/v1/tts");
  });
});
