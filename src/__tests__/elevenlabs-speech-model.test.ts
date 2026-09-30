import { describe, expect, it, vi } from "vitest";
import { SpeechSdkProviderError } from "../errors.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

describe("ElevenLabsSpeechProvider", () => {
  it("classifies ToS blocks as non-retryable content policy errors", async () => {
    const providerBody = {
      detail: {
        type: "authorization_error",
        code: "forbidden",
        message:
          "The text you are trying to use may violate our Terms of Service and has been blocked.",
      },
    };
    const rawResponse = JSON.stringify(providerBody);
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        new Response(rawResponse, {
          status: 403,
          headers: { "request-id": "elevenlabs-request-123" },
        })
      ),
    });

    const thrown = await provider
      .generate({
        modelId: "eleven_multilingual_v2",
        text: "Sensitive input is not repeated in the error.",
        voice: "voice-123",
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(SpeechSdkProviderError);
    expect(thrown).toMatchObject({
      status: 403,
      provider: "elevenlabs",
      model: "eleven_multilingual_v2",
      code: "content_policy",
      details: providerBody,
      rawResponse,
      requestId: "elevenlabs-request-123",
      retryable: false,
      stage: "synthesis",
    });
    expect((thrown as Error).message).not.toContain("Sensitive input");
  });

  it("leaves unrelated ElevenLabs 403 errors on their existing path", async () => {
    const providerBody = {
      detail: {
        type: "authorization_error",
        code: "voice_not_found",
        message: "This voice is not available to your account.",
      },
    };
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(providerBody), { status: 403 })
        ),
    });

    await expect(
      provider.generate({
        modelId: "eleven_multilingual_v2",
        text: "Hello world",
        voice: "restricted-voice",
      })
    ).rejects.toMatchObject({
      status: 403,
      provider: "elevenlabs",
      code: "voice_not_found",
      details: providerBody,
      retryable: false,
    });
  });

  it("classifies a wrapped ToS message without a provider code", async () => {
    const providerBody = {
      message: "Upstream provider rejected the request.",
      details: {
        detail: {
          type: "authorization_error",
          message:
            "The text you are trying to use may violate our Terms of Service and has been blocked.",
        },
      },
    };
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(providerBody), { status: 500 })
        ),
    });

    await expect(
      provider.generate({
        modelId: "eleven_multilingual_v2",
        text: "Sensitive input",
        voice: "voice-123",
      })
    ).rejects.toMatchObject({
      status: 500,
      provider: "elevenlabs",
      code: "content_policy",
      details: providerBody,
      retryable: false,
    });
  });

  it("calls the correct URL with voice_id in path", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-abc-123",
      }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello world",
      voice: "voice-123",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/text-to-speech/voice-123");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.text).toBe("Hello world");
    expect(body.model_id).toBe("eleven_multilingual_v2");
  });

  it("sends xi-api-key header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-123",
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "xi-test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hi",
      voice: "v1",
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["xi-api-key"]).toBe("xi-test-key");
    expect(headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("passes providerOptions through to request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-123",
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "v1",
      providerOptions: {
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        previous_request_ids: ["req-1", "req-2"],
        seed: 42,
        language_code: "en",
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_settings).toEqual({
      stability: 0.5,
      similarity_boost: 0.8,
    });
    expect(body.previous_request_ids).toEqual(["req-1", "req-2"]);
    expect(body.seed).toBe(42);
    expect(body.language_code).toBe("en");
  });

  it("passes output_format as query parameter", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-123",
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "v1",
      providerOptions: {
        output_format: "mp3_44100_192",
      },
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("output_format=mp3_44100_192");
  });

  it("returns requestId in providerMetadata", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-abc-456",
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "v1",
    });

    expect(result.providerMetadata?.requestId).toBe("req-abc-456");
  });

  it("throws ApiError on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers(),
      text: async () => '{"detail": "validation error"}',
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({
        modelId: "eleven_multilingual_v2",
        text: "Hello",
        voice: "v1",
      })
    ).rejects.toThrow();
  });

  it("uses custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-123",
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "v1",
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain("https://my-proxy.com/v1/text-to-speech/v1");
  });

  describe("processAudioTags", () => {
    it.each([
      "eleven_v4",
      "eleven_v4_turbo",
    ])("passes all tags through for %s", (modelId) => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[laughs] Hello [whispers] world",
        modelId
      );
      expect(result.text).toBe("[laughs] Hello [whispers] world");
      expect(result.warnings).toEqual([]);
    });

    it("passes all tags through for eleven_v3", () => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[laugh] Hello [whisper] world [angry] now",
        "eleven_v3"
      );
      expect(result.text).toBe("[laugh] Hello [whisper] world [angry] now");
      expect(result.warnings).toEqual([]);
    });

    it("strips tags for eleven_multilingual_v2", () => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[laugh] Hello world",
        "eleven_multilingual_v2"
      );
      expect(result.text).toBe("Hello world");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("[laugh]");
      expect(result.warnings[0]).toContain("elevenlabs/eleven_multilingual_v2");
    });

    it("strips tags for eleven_flash_v2_5", () => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[angry] Hello",
        "eleven_flash_v2_5"
      );
      expect(result.text).toBe("Hello");
      expect(result.warnings).toHaveLength(1);
    });

    it("strips tags for eleven_flash_v2", () => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags("[sigh] Hi", "eleven_flash_v2");
      expect(result.text).toBe("Hi");
      expect(result.warnings).toHaveLength(1);
    });

    it("returns text unchanged when no tags present", () => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "Hello world",
        "eleven_multilingual_v2"
      );
      expect(result.text).toBe("Hello world");
      expect(result.warnings).toEqual([]);
    });

    it("passes tagged text to generate for eleven_v3", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-type": "audio/mpeg",
          "request-id": "req-123",
        }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

      const provider = new ElevenLabsSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      const taggedText = "[laugh] Hello [whisper] world";
      const { text } = provider.processAudioTags(taggedText, "eleven_v3");

      await provider.generate({
        modelId: "eleven_v3",
        text,
        voice: "v1",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.text).toBe("[laugh] Hello [whisper] world");
    });
  });

  it("requires voice parameter", async () => {
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: vi.fn(),
    });

    await expect(
      provider.generate({
        modelId: "eleven_multilingual_v2",
        text: "Hello",
      })
    ).rejects.toThrow("voice");
  });

  it("returns audioDurationMs from response header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        "content-type": "audio/mpeg",
        "request-id": "req-abc",
        "audio-duration-seconds": "3.45",
      }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello world",
      voice: "voice-id",
    });

    expect(result.audioDurationMs).toBe(3450);
  });

  it("omits audioDurationMs when header is absent", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "voice-id",
    });

    expect(result.audioDurationMs).toBeUndefined();
  });

  it("derives mediaType from output_format when API returns bare audio/pcm Content-Type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/pcm" }),
      arrayBuffer: async () => new Uint8Array(96_000).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "voice-id",
      providerOptions: { output_format: "pcm_48000" },
    });

    expect(result.mediaType).toBe("audio/pcm;rate=48000");
  });

  it("derives stream mediaType from output_format when API returns bare audio/pcm Content-Type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/pcm" }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(4));
          controller.close();
        },
      }),
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.stream({
      modelId: "eleven_multilingual_v2",
      text: "Hello",
      voice: "voice-id",
      providerOptions: { output_format: "pcm_44100" },
    });

    expect(result.mediaType).toBe("audio/pcm;rate=44100");
  });

  describe("dialogueCapabilities", () => {
    it.each([
      "eleven_v4",
      "eleven_v3",
    ])("supports native dialogue for %s", (modelId) => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      expect(provider.dialogueCapabilities(modelId)).toEqual({
        maxVoices: 10,
        maxTotalChars: 2000,
      });
    });

    it("has no HTTP native dialogue for eleven_v4_turbo", () => {
      const provider = new ElevenLabsSpeechProvider({ apiKey: "test-key" });
      expect(provider.dialogueCapabilities("eleven_v4_turbo")).toBeUndefined();
    });

    it("sends eleven_v4 dialogue to /v1/text-to-dialogue", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
      );
      const provider = new ElevenLabsSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      await provider.generateDialogue({
        modelId: "eleven_v4",
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hey." },
        ],
      });

      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain("/v1/text-to-dialogue");
      expect(JSON.parse(init.body).model_id).toBe("eleven_v4");
    });
  });
});
