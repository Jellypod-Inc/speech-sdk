import { describe, expect, it, vi } from "vitest";
import { OpenAISpeechProvider } from "../providers/openai/index.js";
import { streamSpeech } from "../stream-speech.js";

describe("streamSpeech integration", () => {
  it("dispatches to provider.stream() through resolveModel", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([42]));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/mpeg" } }
      )
    );

    const provider = new OpenAISpeechProvider({
      apiKey: "sk-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await streamSpeech({
      model: { provider, modelId: "tts-1" },
      text: "hello",
      voice: "alloy",
    });

    expect(result.mediaType).toBe("audio/mpeg");
    const reader = result.audio.getReader();
    const { value } = await reader.read();
    expect(value).toEqual(new Uint8Array([42]));
  });
});
