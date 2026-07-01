import { describe, expect, it, vi } from "vitest";
import { SpeechifySpeechProvider } from "../providers/speechify/index.js";

describe("SpeechifySpeechProvider.stream", () => {
  it("posts to /audio/stream and returns the response body as a ReadableStream", async () => {
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
    const provider = new SpeechifySpeechProvider({
      apiKey: "speechify-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "simba-english",
      text: "hi",
      voice: "george",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.speechify.ai/v1/audio/stream");
    // Streaming cannot emit wav, so the default format is mp3.
    expect(JSON.parse(init.body).audio_format).toBe("mp3");
    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.stream).toBeInstanceOf(ReadableStream);
  });
});
