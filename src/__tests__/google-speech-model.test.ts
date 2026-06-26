import { describe, expect, it, vi } from "vitest";
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

  describe("single-turn read-aloud framing", () => {
    // Discover the model list from the SDK instead of hardcoding ids.
    const provider = new GoogleSpeechProvider({ apiKey: "test-key" });
    const ttsModelIds = provider.models.map((m) => m.id);
    const newestModelId = [...provider.models].sort((a, b) =>
      b.releaseDate.localeCompare(a.releaseDate)
    )[0].id;

    it.each([
      "Hello there.",
      "General reply.",
      "Okay.",
    ])("frames terse input %j as a read-aloud directive so Gemini voices it instead of answering", async (terse) => {
      const mockFetch = createMockFetch();
      const p = new GoogleSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      const result = await p.generate({
        modelId: newestModelId,
        text: terse,
        voice: "Kore",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const sentText = body.contents[0].parts[0].text;
      // Bare text is what triggers the 400; the request must carry a directive.
      expect(sentText).not.toBe(terse);
      expect(sentText).toBe(`Read aloud: ${terse}`);
      // Modality config is untouched — the framing, not the modality, is the fix.
      expect(body.generationConfig.responseModalities).toEqual(["audio"]);
      // Terse input still yields audio.
      expect(result.audio).toBeInstanceOf(Uint8Array);
      expect(result.mediaType).toBe("audio/wav");
    });

    it("keeps the caller's text verbatim after the directive so spoken content is unchanged", async () => {
      const mockFetch = createMockFetch();
      const p = new GoogleSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      const text = "The weather is lovely today.";
      await p.generate({
        modelId: newestModelId,
        text,
        voice: "Kore",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      const sentText = body.contents[0].parts[0].text as string;
      // The directive is a prefix only; the user's text follows it intact.
      expect(sentText.endsWith(text)).toBe(true);
      expect(sentText.slice(0, -text.length)).toBe("Read aloud: ");
    });

    it("applies the framing across every TTS model on the generateContent path", async () => {
      for (const modelId of ttsModelIds) {
        const mockFetch = createMockFetch();
        const p = new GoogleSpeechProvider({
          apiKey: "test-key",
          fetch: mockFetch,
        });

        await p.generate({ modelId, text: "Hi.", voice: "Kore" });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.contents[0].parts[0].text).toBe("Read aloud: Hi.");
      }
    });
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
