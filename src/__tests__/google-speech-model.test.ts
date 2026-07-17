import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors.js";
import { SpeechSdkProviderError } from "../index.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

describe("GoogleSpeechProvider", () => {
  // base64 of 4 bytes of 16-bit PCM (2 samples of silence)
  const pcmBase64 = "AAAAAA==";
  const geminiResponse = {
    candidates: [
      {
        content: {
          parts: [
            {
              inlineData: {
                mimeType: "audio/L16;codec=pcm;rate=24000",
                data: pcmBase64,
              },
            },
          ],
        },
      },
    ],
  };

  function createMockFetch(data = geminiResponse) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => data,
    });
  }

  it("calls the Gemini API with model in URL and API key as query param", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello",
      voice: "Kore",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=test-key"
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("sends correct body with contents and speech_config", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello world",
      voice: "Zephyr",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "Read aloud: Hello world" }] },
    ]);
    expect(body.generationConfig.responseModalities).toEqual(["audio"]);
    expect(body.generationConfig.speech_config).toEqual({
      voice_config: {
        prebuilt_voice_config: { voice_name: "Zephyr" },
      },
    });
  });

  it("wraps Gemini PCM output in a WAV container", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello",
      voice: "Kore",
    });

    // Result should be a Uint8Array starting with "RIFF...WAVE" header
    expect(result.audio).toBeInstanceOf(Uint8Array);
    expect(result.mediaType).toBe("audio/wav");

    const wav = result.audio as Uint8Array;
    // 44-byte header + 4 bytes of PCM
    expect(wav.length).toBe(48);
    const riff = new TextDecoder().decode(wav.slice(0, 4));
    expect(riff).toBe("RIFF");
    const wave = new TextDecoder().decode(wav.slice(8, 12));
    expect(wave).toBe("WAVE");
    const fmt = new TextDecoder().decode(wav.slice(12, 16));
    expect(fmt).toBe("fmt ");
    const data = new TextDecoder().decode(wav.slice(36, 40));
    expect(data).toBe("data");

    // Verify sample rate in header (little-endian uint32 at offset 24)
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(24, true)).toBe(24_000);
  });

  it("falls back to default sample rate when mimeType rate is invalid", async () => {
    // Malformed mimeType with rate=0 should not slip through to pcmToWav.
    // Without the guard, 0 satisfies `??` fallback (nullish only) and
    // produces an invalid WAV with zero duration.
    const mockFetch = createMockFetch({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "audio/L16;codec=pcm;rate=0",
                  data: pcmBase64,
                },
              },
            ],
          },
        },
      ],
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello",
      voice: "Kore",
    });

    const wav = result.audio as Uint8Array;
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    // Should have fallen back to the default 24_000, not written 0.
    expect(view.getUint32(24, true)).toBe(24_000);
  });

  it("preserves and serializes the complete Google INVALID_ARGUMENT status", async () => {
    const providerBody = {
      error: {
        code: 400,
        message: "Request contains an invalid argument.",
        status: "INVALID_ARGUMENT",
        details: [
          {
            "@type": "type.googleapis.com/google.rpc.BadRequest",
            fieldViolations: [
              {
                field: "generation_config.speech_config",
                description: "The speech configuration is invalid.",
              },
            ],
          },
          {
            "@type": "type.googleapis.com/google.rpc.ErrorInfo",
            reason: "INVALID_SPEECH_CONFIG",
            domain: "generativelanguage.googleapis.com",
            metadata: { rejectedField: "speech_config" },
          },
        ],
      },
    };
    const rawResponse = JSON.stringify(providerBody);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "x-goog-request-id": "google-request-123" }),
      text: async () => rawResponse,
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const thrown = await provider
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yeah, really good, Alex. See you next time.",
        voice: "Kore",
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(SpeechSdkProviderError);
    expect(thrown).toBeInstanceOf(ApiError);
    const error = thrown as SpeechSdkProviderError;
    expect(error).toMatchObject({
      name: "SpeechSdkProviderError",
      status: 400,
      statusCode: 400,
      provider: "google",
      model: "gemini-3.1-flash-tts-preview",
      code: "INVALID_ARGUMENT",
      message: "API error 400: Request contains an invalid argument.",
      requestId: "google-request-123",
      retryable: false,
      stage: "synthesis",
    });
    expect(error.details).toEqual(providerBody);
    expect(error.rawResponse).toBe(rawResponse);
    expect(error.responseBody).toBe(rawResponse);

    const logged = JSON.parse(JSON.stringify(error));
    expect(logged).toMatchObject({
      name: "SpeechSdkProviderError",
      status: 400,
      provider: "google",
      model: "gemini-3.1-flash-tts-preview",
      code: "INVALID_ARGUMENT",
      retryable: false,
      rawResponse,
    });
    expect(logged.details.error.details[0].fieldViolations).toEqual([
      {
        field: "generation_config.speech_config",
        description: "The speech configuration is invalid.",
      },
    ]);
    expect(logged.details.error.details[1].metadata).toEqual({
      rejectedField: "speech_config",
    });
  });

  it("classifies provider 5xx responses as retryable", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      headers: new Headers(),
      text: async () => '{"error":{"message":"Unavailable"}}',
    });
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({
        modelId: "gemini-2.5-flash-preview-tts",
        text: "Hello",
        voice: "Kore",
      })
    ).rejects.toMatchObject({
      name: "SpeechSdkProviderError",
      status: 503,
      retryable: true,
    });
  });

  it("throws when no audio data in response", async () => {
    const mockFetch = createMockFetch({
      candidates: [{ content: { parts: [{ text: "no audio" }] } }],
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({
        modelId: "gemini-2.5-flash-preview-tts",
        text: "Hello",
        voice: "Kore",
      })
    ).rejects.toThrow("No audio data");
  });

  it("uses custom baseURL", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/v1beta",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello",
      voice: "Kore",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://my-proxy.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=test-key"
    );
  });

  it("spreads providerOptions into generationConfig", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello",
      voice: "Kore",
      providerOptions: { temperature: 0.5 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.5);
  });

  it("frames terse single-turn input as a read-aloud directive instead of a bare turn", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello there.",
      voice: "Kore",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe("Read aloud: Hello there.");
    expect(result.audio).toBeInstanceOf(Uint8Array);
  });

  it("keeps delivery instructions separate until Gemini request serialization", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "These words are spoken.",
      instructions: "Use a confident, warm delivery.",
      voice: "Kore",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe(
      "Use a confident, warm delivery.\n\nRead aloud: These words are spoken."
    );
  });

  it("separates native-dialogue delivery notes from its transcript", async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generateDialogue({
      modelId: "gemini-2.5-flash-preview-tts",
      instructions: "Keep the exchange conversational.",
      turns: [
        { voice: "Kore", text: "Hello.", instructions: "Sound upbeat." },
        { voice: "Puck", text: "Goodbye.", instructions: "Sound calm." },
      ],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents[0].parts[0].text).toBe(
      "Delivery instructions:\nKeep the exchange conversational.\nSpeaker1: Sound upbeat.\nSpeaker2: Sound calm.\n\nTranscript:\nSpeaker1: Hello.\nSpeaker2: Goodbye."
    );
  });

  describe("processAudioTags", () => {
    it("passes all tags through for gemini-3.1-flash-tts-preview", () => {
      const provider = new GoogleSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[whispers] Hello [shouting] world [laugh] now",
        "gemini-3.1-flash-tts-preview"
      );
      expect(result.text).toBe("[whispers] Hello [shouting] world [laugh] now");
      expect(result.warnings).toEqual([]);
    });

    it("strips tags for gemini-2.5-flash-preview-tts", () => {
      const provider = new GoogleSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[laugh] Hello world",
        "gemini-2.5-flash-preview-tts"
      );
      expect(result.text).toBe("Hello world");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(
        "google/gemini-2.5-flash-preview-tts"
      );
    });

    it("strips tags for gemini-2.5-pro-preview-tts", () => {
      const provider = new GoogleSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[sigh] Hi",
        "gemini-2.5-pro-preview-tts"
      );
      expect(result.text).toBe("Hi");
      expect(result.warnings).toHaveLength(1);
    });

    it("returns text unchanged when no tags present", () => {
      const provider = new GoogleSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "Hello world",
        "gemini-3.1-flash-tts-preview"
      );
      expect(result.text).toBe("Hello world");
      expect(result.warnings).toEqual([]);
    });
  });
});
