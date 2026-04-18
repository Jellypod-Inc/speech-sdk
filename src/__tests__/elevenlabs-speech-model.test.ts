import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

describe("ElevenLabsSpeechProvider", () => {
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
});
