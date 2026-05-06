import { describe, expect, it, vi } from "vitest";
import { ApiError, StreamingNotSupportedError } from "../errors.js";
import type { SpeechProvider } from "../speech-provider.js";
import { streamSpeech } from "../stream-speech.js";

function bytesStream(payload: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
}

function makeProvider(overrides: Partial<SpeechProvider> = {}): SpeechProvider {
  return {
    id: "test",
    defaultModel: "m1",
    models: [
      {
        id: "m1",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: ["streaming"],
      },
    ],
    generate: vi.fn(),
    ...overrides,
  } as SpeechProvider;
}

describe("streamSpeech", () => {
  it("returns a ReadableStream of audio bytes", async () => {
    const provider = makeProvider({
      stream: vi.fn().mockResolvedValue({
        stream: bytesStream(new Uint8Array([1, 2, 3])),
        mediaType: "audio/mpeg",
      }),
    });

    const result = await streamSpeech({
      model: { provider, modelId: "m1" },
      text: "hello",
      voice: "v",
    });

    expect(result.mediaType).toBe("audio/mpeg");
    const reader = result.audio.getReader();
    const { value } = await reader.read();
    expect(value).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("throws StreamingNotSupportedError when model lacks the streaming feature", async () => {
    const provider = makeProvider({
      models: [
        {
          id: "m1",
          releaseDate: "2025-01-01",
          languages: ["en"],
          features: [],
        },
      ],
      stream: vi.fn(),
    });

    await expect(
      streamSpeech({
        model: { provider, modelId: "m1" },
        text: "hi",
        voice: "v",
      })
    ).rejects.toBeInstanceOf(StreamingNotSupportedError);
  });

  it("throws StreamingNotSupportedError when stream() is not implemented", async () => {
    const provider = makeProvider();
    await expect(
      streamSpeech({
        model: { provider, modelId: "m1" },
        text: "hi",
        voice: "v",
      })
    ).rejects.toBeInstanceOf(StreamingNotSupportedError);
  });

  it("retries stream() on retryable errors", async () => {
    const streamFn = vi
      .fn()
      .mockRejectedValueOnce(new ApiError("boom", { statusCode: 500 }))
      .mockResolvedValueOnce({
        stream: bytesStream(new Uint8Array([9])),
        mediaType: "audio/mpeg",
      });
    const provider = makeProvider({ stream: streamFn });

    const result = await streamSpeech({
      model: { provider, modelId: "m1" },
      text: "hi",
      voice: "v",
      maxRetries: 1,
    });

    expect(streamFn).toHaveBeenCalledTimes(2);
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("does not retry on 4xx errors", async () => {
    const streamFn = vi
      .fn()
      .mockRejectedValue(new ApiError("bad", { statusCode: 400 }));
    const provider = makeProvider({ stream: streamFn });

    await expect(
      streamSpeech({
        model: { provider, modelId: "m1" },
        text: "hi",
        voice: "v",
        maxRetries: 3,
      })
    ).rejects.toBeInstanceOf(ApiError);
    expect(streamFn).toHaveBeenCalledTimes(1);
  });

  it("streams string models through the speech gateway with apiKey as bearer", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      body: bytesStream(new Uint8Array([1, 2, 3])),
    });

    const savedFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;
    try {
      const result = await streamSpeech({
        model: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
        apiKey: "gw-custom-key",
      });

      expect(result.mediaType).toBe("audio/mpeg");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.speechbase.ai/v1/audio/speech");
      expect(init.headers.Authorization).toBe("Bearer gw-custom-key");
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("applies processAudioTags warnings", async () => {
    const streamFn = vi.fn().mockResolvedValue({
      stream: bytesStream(new Uint8Array([1])),
      mediaType: "audio/mpeg",
    });
    const provider = makeProvider({
      stream: streamFn,
      processAudioTags: vi
        .fn()
        .mockReturnValue({ text: "hi", warnings: ["stripped"] }),
    });

    const result = await streamSpeech({
      model: { provider, modelId: "m1" },
      text: "hi [laugh]",
      voice: "v",
    });

    expect(result.warnings).toEqual(["stripped"]);
  });
});
