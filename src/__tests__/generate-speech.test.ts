import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";
import type { SpeechProvider } from "../speech-provider.js";

function createMockProvider(
  overrides?: Partial<
    ReturnType<SpeechProvider["generate"]> extends Promise<infer T> ? T : never
  >,
  providerOverrides?: Partial<SpeechProvider>
): SpeechProvider {
  return {
    id: "mock",
    defaultModel: "mock-model",
    generate: vi.fn().mockResolvedValue({
      audio: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      mediaType: "audio/mpeg",
      ...overrides,
    }),
    ...providerOverrides,
  };
}

describe("generateSpeech", () => {
  it("calls provider.generate and returns SpeechResult", async () => {
    const provider = createMockProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello world",
      voice: "test-voice",
    });

    expect(result.audio.uint8Array).toEqual(
      new Uint8Array([72, 101, 108, 108, 111])
    );
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.audio.base64).toBe(btoa("Hello"));
  });

  it("passes text, voice, and providerOptions to provider", async () => {
    const provider = createMockProvider();
    await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "some-voice",
      providerOptions: { speed: 1.5 },
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "test-model",
        text: "Hello",
        voice: "some-voice",
        providerOptions: { speed: 1.5 },
      })
    );
  });

  it("passes headers and abortSignal to provider", async () => {
    const provider = createMockProvider();
    const controller = new AbortController();

    await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      headers: { "X-Custom": "value" },
      abortSignal: controller.signal,
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { "X-Custom": "value" },
        abortSignal: controller.signal,
      })
    );
  });

  it("returns providerMetadata when present", async () => {
    const provider = createMockProvider({
      providerMetadata: { requestId: "req-123" },
    });

    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
    });

    expect(result.providerMetadata).toEqual({ requestId: "req-123" });
  });

  it("throws NoSpeechGeneratedError when audio is empty", async () => {
    const provider = createMockProvider({
      audio: new Uint8Array(0),
    });

    await expect(
      generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "Hello",
      })
    ).rejects.toThrow("No speech audio was generated.");
  });

  it("handles base64 string audio from provider", async () => {
    const provider = createMockProvider({
      audio: btoa("Hello"),
    });

    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
    });

    expect(result.audio.base64).toBe(btoa("Hello"));
    expect(result.audio.uint8Array).toEqual(
      new Uint8Array([72, 101, 108, 108, 111])
    );
  });

  it("retries on 5xx errors", async () => {
    const error = new ApiError("Server error", {
      statusCode: 500,
      model: "mock/test-model",
    });

    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "mock-model",
      generate: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue({
          audio: new Uint8Array([1]),
          mediaType: "audio/mpeg",
        }),
    };

    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      maxRetries: 1,
    });

    expect(result.audio.uint8Array).toEqual(new Uint8Array([1]));
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  describe("audio tags", () => {
    it("strips audio tags and returns warnings when provider has no processAudioTags", async () => {
      const provider = createMockProvider();
      const result = await generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "[laugh] Hello world",
        voice: "test-voice",
      });

      expect(provider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Hello world" })
      );
      expect(result.warnings).toEqual([
        "Audio tag [laugh] is not supported by mock/mock-model and was removed.",
      ]);
    });

    it("returns no warnings when text has no audio tags", async () => {
      const provider = createMockProvider();
      const result = await generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "Hello world",
        voice: "test-voice",
      });

      expect(provider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Hello world" })
      );
      expect(result.warnings).toBeUndefined();
    });

    it("calls provider processAudioTags when available", async () => {
      const processAudioTags = vi.fn().mockReturnValue({
        text: "processed text",
        warnings: ["custom warning"],
      });
      const provider = createMockProvider(undefined, { processAudioTags });

      const result = await generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "[tag] Hello",
        voice: "test-voice",
      });

      expect(processAudioTags).toHaveBeenCalledWith(
        "[tag] Hello",
        "mock-model"
      );
      expect(provider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "processed text" })
      );
      expect(result.warnings).toEqual(["custom warning"]);
    });

    it("throws when text is empty after stripping audio tags", async () => {
      const provider = createMockProvider();

      await expect(
        generateSpeech({
          model: { provider, modelId: "mock-model" },
          text: "[laugh] [sigh]",
          voice: "test-voice",
        })
      ).rejects.toThrow(
        "Text is empty after removing unsupported audio tags for mock/mock-model."
      );
      expect(provider.generate).not.toHaveBeenCalled();
    });

    it("throws when text is empty after provider processAudioTags", async () => {
      const processAudioTags = vi.fn().mockReturnValue({
        text: "  ",
        warnings: ["tag removed"],
      });
      const provider = createMockProvider(undefined, { processAudioTags });

      await expect(
        generateSpeech({
          model: { provider, modelId: "mock-model" },
          text: "[unknown]",
          voice: "test-voice",
        })
      ).rejects.toThrow(
        "Text is empty after removing unsupported audio tags for mock/mock-model."
      );
      expect(provider.generate).not.toHaveBeenCalled();
    });

    it("throws generic error when text is empty with no tags", async () => {
      const provider = createMockProvider();

      await expect(
        generateSpeech({
          model: { provider, modelId: "mock-model" },
          text: "   ",
          voice: "test-voice",
        })
      ).rejects.toThrow("Text must not be empty.");
      expect(provider.generate).not.toHaveBeenCalled();
    });

    it("does not throw when text is only tags but provider supports them", async () => {
      const processAudioTags = vi.fn().mockReturnValue({
        text: "[laugh] [sigh]",
        warnings: [],
      });
      const provider = createMockProvider(undefined, { processAudioTags });

      const result = await generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "[laugh] [sigh]",
        voice: "test-voice",
      });

      expect(provider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "[laugh] [sigh]" })
      );
      expect(result.audio).toBeDefined();
    });

    it("does not strip tags when provider has processAudioTags", async () => {
      const processAudioTags = vi.fn().mockReturnValue({
        text: "[laugh] Hello world",
        warnings: [],
      });
      const provider = createMockProvider(undefined, { processAudioTags });

      await generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "[laugh] Hello world",
        voice: "test-voice",
      });

      expect(provider.generate).toHaveBeenCalledWith(
        expect.objectContaining({ text: "[laugh] Hello world" })
      );
    });

    it("does not include warnings in result when provider returns empty warnings", async () => {
      const processAudioTags = vi.fn().mockReturnValue({
        text: "Hello world",
        warnings: [],
      });
      const provider = createMockProvider(undefined, { processAudioTags });

      const result = await generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "Hello world",
        voice: "test-voice",
      });

      expect(result.warnings).toBeUndefined();
    });
  });

  it("works with browser-like fetch that requires correct this context", async () => {
    const context = { isBrowserWindow: true };
    // Simulates browser fetch which throws "Illegal invocation" when
    // called without the correct `this` binding (Window context).
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== context) {
        throw new TypeError(
          "Failed to execute 'fetch' on 'Window': Illegal invocation"
        );
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/mpeg" }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });
    });

    const savedFetch = globalThis.fetch;
    globalThis.fetch = browserFetch.bind(context) as typeof globalThis.fetch;
    try {
      const provider = new OpenAISpeechProvider({ apiKey: "test-key" });
      const result = await generateSpeech({
        model: { provider, modelId: "tts-1" },
        text: "Hello",
      });
      expect(result.audio).toBeDefined();
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("does not retry on 4xx errors", async () => {
    const error = new ApiError("Auth error", {
      statusCode: 401,
      model: "mock/test-model",
    });

    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "mock-model",
      generate: vi.fn().mockRejectedValue(error),
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "Hello",
        maxRetries: 2,
      })
    ).rejects.toThrow();
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
