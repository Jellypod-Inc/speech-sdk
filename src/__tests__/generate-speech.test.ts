import { describe, expect, it, vi } from "vitest";
import { ApiError, TextChunkingUnsupportedError } from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
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
      audio: new Uint8Array([72, 101, 108, 108, 111]),
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

  it("splits long text on model maxInputChars and stitches provider chunks", async () => {
    const pcm = new Uint8Array(new Int16Array(240).buffer);
    const provider = createMockProvider(undefined, {
      models: [
        {
          id: "test-model",
          releaseDate: "2026-01-01",
          languages: ["en"],
          features: [],
          maxInputChars: 16,
        },
      ],
      generate: vi.fn().mockImplementation(async ({ text }) => ({
        audio: pcm,
        mediaType: "audio/pcm;rate=24000",
        warnings: [`chunk:${text.length}`],
      })),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });

    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "First sentence. Second sentence.",
      voice: "some-voice",
      providerOptions: { format: "mp3" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.metadata.inputChars).toBe(32);
    expect(result.warnings).toEqual(["chunk:15", "chunk:16"]);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        text: "First sentence.",
        providerOptions: { format: "pcm" },
      })
    );
    expect(provider.generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        text: "Second sentence.",
        providerOptions: { format: "pcm" },
      })
    );
  });

  it("offsets native timestamps when stitching chunked speech", async () => {
    const pcm = new Uint8Array(new Int16Array(24_000).buffer);
    const provider = createMockProvider(undefined, {
      models: [
        {
          id: "test-model",
          releaseDate: "2026-01-01",
          languages: ["en"],
          features: ["timestamps"],
          maxInputChars: 16,
        },
      ],
      generate: vi
        .fn()
        .mockImplementation(async ({ text, includeTimestamps }) => ({
          audio: pcm,
          mediaType: "audio/pcm;rate=24000",
          timestamps: includeTimestamps
            ? [{ text: text.split(" ")[0], start: 0, end: 0.25 }]
            : undefined,
        })),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });

    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "First sentence. Second sentence.",
      voice: "some-voice",
      timestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "First", start: 0, end: 0.25 },
      { text: "Second", start: 1, end: 1.25 },
    ]);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ includeTimestamps: true })
    );
    expect(provider.generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ includeTimestamps: true })
    );
  });

  it("uses caller maxInputChars even when the model has no explicit limit", async () => {
    const pcm = new Uint8Array(new Int16Array(240).buffer);
    const provider = createMockProvider(undefined, {
      generate: vi.fn().mockImplementation(async ({ text }) => ({
        audio: pcm,
        mediaType: "audio/pcm;rate=24000",
        warnings: [`chunk:${text.length}`],
      })),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });

    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "First sentence. Second sentence.",
      voice: "some-voice",
      maxInputChars: 16,
    });

    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(result.warnings).toEqual(["chunk:15", "chunk:16"]);
  });

  it("lets caller maxInputChars override a lower provider max", async () => {
    const provider = createMockProvider(undefined, {
      models: [
        {
          id: "test-model",
          releaseDate: "2026-01-01",
          languages: ["en"],
          features: [],
          maxInputChars: 16,
        },
      ],
    });

    await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "First sentence. Second sentence.",
      voice: "some-voice",
      maxInputChars: 100,
    });

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "First sentence. Second sentence." })
    );
  });

  it("does not split long text without explicit model maxInputChars", async () => {
    const provider = createMockProvider(undefined, {
      models: [
        {
          id: "test-model",
          releaseDate: "2026-01-01",
          languages: ["en"],
          features: [],
        },
      ],
      getStitchOptions: () => ({
        providerOptions: { format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });

    await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "First sentence. Second sentence.",
      voice: "some-voice",
    });

    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "First sentence. Second sentence." })
    );
  });

  it("does not chunk gateway-routed calls when maxInputChars is provided", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const gateway = createSpeechGateway({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await generateSpeech({
      model: gateway("openai/tts-1"),
      text: "First sentence. Second sentence.",
      voice: "alloy",
      maxInputChars: 16,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({
      model: "openai/tts-1",
      voice: "alloy",
      text: "First sentence. Second sentence.",
    });
  });

  it("does not validate ignored gateway maxInputChars values", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
    const gateway = createSpeechGateway({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await generateSpeech({
      model: gateway("openai/tts-1"),
      text: "First sentence. Second sentence.",
      voice: "alloy",
      maxInputChars: Number.NaN,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("throws when chunking is required but the provider cannot stitch chunks", async () => {
    const provider = createMockProvider(undefined, {
      models: [
        {
          id: "test-model",
          releaseDate: "2026-01-01",
          languages: ["en"],
          features: [],
          maxInputChars: 16,
        },
      ],
    });

    await expect(
      generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "First sentence. Second sentence.",
        voice: "some-voice",
      })
    ).rejects.toBeInstanceOf(TextChunkingUnsupportedError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  describe("chunked speech concurrency", () => {
    function chunkingProvider(generate: SpeechProvider["generate"]) {
      return {
        id: "mock",
        defaultModel: "test-model",
        models: [
          {
            id: "test-model",
            releaseDate: "2026-01-01",
            languages: ["en"],
            features: [],
            maxInputChars: 16,
          },
        ],
        generate,
        getStitchOptions: () => ({
          providerOptions: { format: "pcm" },
          mediaType: "audio/pcm;rate=24000",
        }),
      } satisfies SpeechProvider;
    }

    it("fans out chunks in parallel by default", async () => {
      const pcm = new Uint8Array(new Int16Array(240).buffer);
      let inFlight = 0;
      let peakInFlight = 0;
      const provider = chunkingProvider(
        vi.fn().mockImplementation(async () => {
          inFlight++;
          peakInFlight = Math.max(peakInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 10));
          inFlight--;
          return { audio: pcm, mediaType: "audio/pcm;rate=24000" };
        })
      );

      await generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "First sentence. Second sentence. Third sentence.",
        voice: "v",
      });

      expect(provider.generate).toHaveBeenCalledTimes(3);
      expect(peakInFlight).toBeGreaterThan(1);
    });

    it("serializes when maxConcurrency is 1", async () => {
      const pcm = new Uint8Array(new Int16Array(240).buffer);
      let inFlight = 0;
      let peakInFlight = 0;
      const provider = chunkingProvider(
        vi.fn().mockImplementation(async () => {
          inFlight++;
          peakInFlight = Math.max(peakInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 10));
          inFlight--;
          return { audio: pcm, mediaType: "audio/pcm;rate=24000" };
        })
      );

      await generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "First sentence. Second sentence. Third sentence.",
        voice: "v",
        maxConcurrency: 1,
      });

      expect(provider.generate).toHaveBeenCalledTimes(3);
      expect(peakInFlight).toBe(1);
    });

    it("preserves chunk order even when later chunks finish first", async () => {
      const pcm = new Uint8Array(new Int16Array(240).buffer);
      // Earlier chunks resolve later — exposes any ordering bug in the stitcher.
      const delays: Record<string, number> = {
        "First sentence.": 30,
        "Second sentence.": 5,
      };
      const provider = chunkingProvider(
        vi.fn().mockImplementation(async ({ text }) => {
          await new Promise((r) => setTimeout(r, delays[text] ?? 0));
          return {
            audio: pcm,
            mediaType: "audio/pcm;rate=24000",
            warnings: [`chunk:${text}`],
          };
        })
      );

      const result = await generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "First sentence. Second sentence.",
        voice: "v",
      });

      expect(result.warnings).toEqual([
        "chunk:First sentence.",
        "chunk:Second sentence.",
      ]);
    });

    it("rejects with the first chunk error", async () => {
      const pcm = new Uint8Array(new Int16Array(240).buffer);
      const provider = chunkingProvider(
        vi.fn().mockImplementation(({ text }) => {
          if (text === "Second sentence.") {
            return Promise.reject(new ApiError("boom", { statusCode: 400 }));
          }
          return Promise.resolve({
            audio: pcm,
            mediaType: "audio/pcm;rate=24000",
          });
        })
      );

      await expect(
        generateSpeech({
          model: { provider, modelId: "test-model" },
          text: "First sentence. Second sentence.",
          voice: "v",
          maxRetries: 0,
        })
      ).rejects.toMatchObject({ name: "ApiError", statusCode: 400 });
    });

    it("rejects non-finite or non-integer maxConcurrency", async () => {
      const provider = chunkingProvider(
        vi.fn().mockResolvedValue({
          audio: new Uint8Array(2),
          mediaType: "audio/pcm;rate=24000",
        })
      );

      for (const bad of [Number.NaN, 0, -1, 1.5, Number.POSITIVE_INFINITY]) {
        await expect(
          generateSpeech({
            model: { provider, modelId: "test-model" },
            text: "First sentence. Second sentence.",
            voice: "v",
            maxConcurrency: bad,
          })
        ).rejects.toThrow("maxConcurrency must be a positive integer.");
      }
      expect(provider.generate).not.toHaveBeenCalled();
    });

    it("rejects (not resolves with sparse results) when caller aborts mid-flight", async () => {
      // Worker ignores the abort signal — exposes the swallow path where a runner
      // exits cleanly after seeing controller.signal.aborted instead of throwing.
      const pcm = new Uint8Array(new Int16Array(240).buffer);
      const ctl = new AbortController();
      ctl.abort(new Error("user cancelled"));
      const provider = chunkingProvider(
        vi
          .fn()
          .mockResolvedValue({ audio: pcm, mediaType: "audio/pcm;rate=24000" })
      );

      await expect(
        generateSpeech({
          model: { provider, modelId: "test-model" },
          text: "First sentence. Second sentence.",
          voice: "v",
          abortSignal: ctl.signal,
          maxConcurrency: 1,
          maxRetries: 0,
        })
      ).rejects.toThrow("user cancelled");
    });

    it("aborts in-flight sibling chunks when one chunk fails", async () => {
      const seenAbortReasons: unknown[] = [];
      const provider = chunkingProvider(
        vi.fn().mockImplementation(({ text, abortSignal }) => {
          if (text === "First sentence.") {
            return new Promise((_resolve, reject) => {
              const onAbort = () => {
                seenAbortReasons.push(abortSignal?.reason);
                reject(new Error("aborted"));
              };
              if (abortSignal?.aborted) {
                onAbort();
                return;
              }
              abortSignal?.addEventListener("abort", onAbort, { once: true });
            });
          }
          // Second chunk fails fast — should cause first chunk's signal to abort.
          return Promise.reject(new ApiError("boom", { statusCode: 400 }));
        })
      );

      await expect(
        generateSpeech({
          model: { provider, modelId: "test-model" },
          text: "First sentence. Second sentence.",
          voice: "v",
          maxRetries: 0,
          maxConcurrency: 2,
        })
      ).rejects.toMatchObject({ name: "ApiError", statusCode: 400 });

      expect(seenAbortReasons).toHaveLength(1);
      expect(seenAbortReasons[0]).toMatchObject({
        name: "ApiError",
        statusCode: 400,
      });
    });
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
    // Browser fetch throws "Illegal invocation" without correct `this` binding;
    // provider's .bind(globalThis) is what makes the call legal.
    const browserFetch = vi.fn(function (this: unknown) {
      if (this !== globalThis) {
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
    globalThis.fetch = browserFetch as typeof globalThis.fetch;
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

  it("routes string models through the speech gateway with apiKey as bearer", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        audio: btoa("\x01\x02\x03"),
        mediaType: "audio/mpeg",
        timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
      }),
    });

    const savedFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;
    try {
      const result = await generateSpeech({
        model: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
        apiKey: "gw-custom-key",
        timestamps: true,
      });

      expect(result.audio).toBeDefined();
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://api.speechbase.ai/v1/audio/speech/with-timestamps"
      );
      expect(init.headers.Authorization).toBe("Bearer gw-custom-key");
      const body = JSON.parse(init.body);
      expect(body).toEqual({
        model: "openai/tts-1",
        voice: "alloy",
        text: "Hello",
      });
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("passes volumeDbfs through to the speech gateway instead of normalizing locally", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        audio: btoa("\x01\x02\x03"),
        mediaType: "audio/mpeg",
        timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
      }),
    });

    const savedFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;
    try {
      const result = await generateSpeech({
        model: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
        apiKey: "gw-custom-key",
        volumeDbfs: -20,
        timestamps: true,
      });

      expect(result.audio.mediaType).toBe("audio/mpeg");
      const [, init] = mockFetch.mock.calls[0];
      expect(JSON.parse(init.body)).toEqual({
        model: "openai/tts-1",
        voice: "alloy",
        text: "Hello",
        volumeDbfs: -20,
      });
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("ignores apiKey when model is a ResolvedModel", async () => {
    const provider = createMockProvider();
    await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "test-voice",
      apiKey: "sk-should-be-ignored",
    });

    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 4xx errors", async () => {
    const error = new ApiError("Auth error", {
      statusCode: 401,
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

  it("does not retry gateway 401 responses", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ error: "unauthorized" }),
    });

    const savedFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as typeof globalThis.fetch;
    try {
      await expect(
        generateSpeech({
          model: "openai/tts-1",
          text: "Hello",
          voice: "alloy",
          apiKey: "bad-gw-key",
          maxRetries: 2,
        })
      ).rejects.toMatchObject({ name: "ApiError", statusCode: 401 });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("does not retry on 501 Not Implemented", async () => {
    // 501 = gateway's "this capability will never work" signal; retrying wastes round-trips.
    const error = new ApiError("Not implemented", {
      statusCode: 501,
      code: "timestamps_unsupported",
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

  describe("429 / Retry-After", () => {
    it("retries on 429 by default", async () => {
      const error = new ApiError("Rate limited", { statusCode: 429 });
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

    it("waits at least Retry-After seconds before retry", async () => {
      const retryAfterSeconds = 2;
      const error = new ApiError("Rate limited", {
        statusCode: 429,
        retryAfterMs: retryAfterSeconds * 1000,
      });
      const callTimes: number[] = [];
      const provider: SpeechProvider = {
        id: "mock",
        defaultModel: "mock-model",
        generate: vi.fn().mockImplementation(() => {
          callTimes.push(performance.now());
          if (callTimes.length === 1) {
            return Promise.reject(error);
          }
          return Promise.resolve({
            audio: new Uint8Array([1]),
            mediaType: "audio/mpeg",
          });
        }),
      };

      await generateSpeech({
        model: { provider, modelId: "test-model" },
        text: "Hello",
        maxRetries: 1,
      });

      const elapsed = (callTimes[1] ?? 0) - (callTimes[0] ?? 0);
      expect(elapsed).toBeGreaterThanOrEqual(retryAfterSeconds * 1000);
    }, 10_000);

    it("caps Retry-After at 60s to avoid pathological waits", async () => {
      const error = new ApiError("Rate limited", {
        statusCode: 429,
        retryAfterMs: 600_000,
      });
      const callTimes: number[] = [];
      const provider: SpeechProvider = {
        id: "mock",
        defaultModel: "mock-model",
        generate: vi.fn().mockImplementation(() => {
          callTimes.push(performance.now());
          if (callTimes.length === 1) {
            return Promise.reject(error);
          }
          return Promise.resolve({
            audio: new Uint8Array([1]),
            mediaType: "audio/mpeg",
          });
        }),
      };

      // Abort after 5s — well under the 60s cap but well over what a sane retry would wait.
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);

      await expect(
        generateSpeech({
          model: { provider, modelId: "test-model" },
          text: "Hello",
          maxRetries: 1,
          abortSignal: controller.signal,
        })
      ).rejects.toThrow();
      expect(provider.generate).toHaveBeenCalledTimes(1);
    }, 10_000);

    it("populates ApiError.retryAfterMs from Retry-After: <seconds> header", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          "content-type": "application/json",
          "retry-after": "3",
        }),
        text: async () => JSON.stringify({ error: "rate limited" }),
      });

      const savedFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;
      try {
        await expect(
          generateSpeech({
            model: "openai/tts-1",
            text: "Hello",
            voice: "alloy",
            apiKey: "gw-key",
            maxRetries: 0,
          })
        ).rejects.toMatchObject({
          name: "ApiError",
          statusCode: 429,
          retryAfterMs: 3000,
        });
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it("populates ApiError.retryAfterMs from Retry-After: <HTTP-date>", async () => {
      const futureDate = new Date(Date.now() + 4000);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({
          "content-type": "application/json",
          "retry-after": futureDate.toUTCString(),
        }),
        text: async () => JSON.stringify({ error: "rate limited" }),
      });

      const savedFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;
      try {
        const captured = await generateSpeech({
          model: "openai/tts-1",
          text: "Hello",
          voice: "alloy",
          apiKey: "gw-key",
          maxRetries: 0,
        }).catch((e) => e as ApiError);
        expect(captured.statusCode).toBe(429);
        // HTTP-date precision is to the second; allow ±1s of slack.
        expect(captured.retryAfterMs).toBeGreaterThanOrEqual(2000);
        expect(captured.retryAfterMs).toBeLessThanOrEqual(5000);
      } finally {
        globalThis.fetch = savedFetch;
      }
    });

    it("leaves retryAfterMs undefined when header is absent", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ error: "rate limited" }),
      });

      const savedFetch = globalThis.fetch;
      globalThis.fetch = mockFetch as typeof globalThis.fetch;
      try {
        await expect(
          generateSpeech({
            model: "openai/tts-1",
            text: "Hello",
            voice: "alloy",
            apiKey: "gw-key",
            maxRetries: 0,
          })
        ).rejects.toMatchObject({
          statusCode: 429,
          retryAfterMs: undefined,
        });
      } finally {
        globalThis.fetch = savedFetch;
      }
    });
  });
});
