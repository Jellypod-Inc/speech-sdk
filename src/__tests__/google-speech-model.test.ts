import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

describe("GoogleSpeechProvider", () => {
  // base64 of 1024 bytes of 16-bit PCM silence.
  const pcmBase64 = Buffer.alloc(1024).toString("base64");
  const truncatedPcmBase64 = Buffer.alloc(4).toString("base64");
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
    // 44-byte header + 1024 bytes of PCM
    expect(wav.length).toBe(1068);
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

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () => '{"error": "forbidden"}',
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({
        modelId: "gemini-2.5-flash-preview-tts",
        text: "Hello",
        voice: "Kore",
      })
    ).rejects.toThrow();
  });

  it("retries an empty Gemini response before returning audio", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "no audio" }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => geminiResponse,
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

    expect(result.mediaType).toBe("audio/wav");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries a truncated Gemini PCM response before returning audio", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    inlineData: {
                      mimeType: "audio/L16;codec=pcm;rate=24000",
                      data: truncatedPcmBase64,
                    },
                  },
                ],
              },
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => geminiResponse,
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

    expect(result.mediaType).toBe("audio/wav");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws a typed error after exhausting degenerate Gemini retries", async () => {
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
    ).rejects.toMatchObject({
      name: "ApiError",
      statusCode: 503,
      code: "gemini_degenerate_audio",
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry safety-blocked Gemini responses", async () => {
    const mockFetch = createMockFetch({
      candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
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
      name: "ApiError",
      statusCode: 400,
      code: "gemini_audio_blocked",
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("honors abortSignal while waiting to retry Gemini audio extraction", async () => {
    const mockFetch = createMockFetch({
      candidates: [{ content: { parts: [{ text: "no audio" }] } }],
    });
    const controller = new AbortController();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const promise = provider.generate({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "Hello",
      voice: "Kore",
      abortSignal: controller.signal,
    });
    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    controller.abort(new Error("stop retrying"));

    await expect(promise).rejects.toThrow("stop retrying");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("retries an empty Gemini dialogue response before returning audio", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          candidates: [{ content: { parts: [{ text: "no audio" }] } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => geminiResponse,
      });

    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generateDialogue({
      modelId: "gemini-2.5-flash-preview-tts",
      turns: [
        { voice: "Kore", text: "Hello" },
        { voice: "Puck", text: "Hi" },
      ],
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(mockFetch).toHaveBeenCalledTimes(2);
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
