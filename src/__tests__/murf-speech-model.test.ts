import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { MurfSpeechProvider } from "../providers/murf/index.js";

describe("MurfSpeechProvider", () => {
  const mockJsonResponse = (encodedAudio = "dGVzdA==") =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ encodedAudio }),
    });

  it("calls the correct URL", async () => {
    const mockFetch = mockJsonResponse();

    const provider = new MurfSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "GEN2",
      text: "Hello world",
      voice: "en-US-natalie",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.murf.ai/v1/speech/generate");
    expect(init.method).toBe("POST");
  });

  it("sends api-key header (lowercase)", async () => {
    const mockFetch = mockJsonResponse();

    const provider = new MurfSpeechProvider({
      apiKey: "murf-key-123",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "GEN2", text: "Hi" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["api-key"]).toBe("murf-key-123");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    // Should NOT have Authorization header
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("sends correct body with voiceId, text, and encodeAsBase64", async () => {
    const mockFetch = mockJsonResponse();

    const provider = new MurfSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "GEN2",
      text: "Hello world",
      voice: "en-US-natalie",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voiceId).toBe("en-US-natalie");
    expect(body.text).toBe("Hello world");
    expect(body.encodeAsBase64).toBe(true);
  });

  it("always injects encodeAsBase64: true even with providerOptions", async () => {
    const mockFetch = mockJsonResponse();

    const provider = new MurfSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "GEN2",
      text: "Hello",
      providerOptions: { style: "conversational" },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.encodeAsBase64).toBe(true);
    expect(body.style).toBe("conversational");
  });

  it("returns base64 audio string and mediaType", async () => {
    const mockFetch = mockJsonResponse("YXVkaW9kYXRh");

    const provider = new MurfSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "GEN2",
      text: "Hello",
    });

    expect(result.audio).toBe("YXVkaW9kYXRh");
    expect(result.mediaType).toBe("audio/wav");
  });

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new MurfSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "GEN2", text: "Hello" })
    ).rejects.toThrow();
  });

  it("uses custom baseURL", async () => {
    const mockFetch = mockJsonResponse();

    const provider = new MurfSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/v1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "GEN2", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.com/v1/speech/generate");
  });

  it("spreads providerOptions into body", async () => {
    const mockFetch = mockJsonResponse();

    const provider = new MurfSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "GEN2",
      text: "Hello",
      providerOptions: { speed: 1.2 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.speed).toBe(1.2);
  });

  describe("FALCON model", () => {
    it("uses /speech/stream endpoint", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

      const provider = new MurfSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      await provider.generate({
        modelId: "FALCON",
        text: "Hello",
        voice: "en-US-natalie",
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.murf.ai/v1/speech/stream");
    });

    it("sends model: FALCON in body and no encodeAsBase64", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

      const provider = new MurfSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      await provider.generate({
        modelId: "FALCON",
        text: "Hello",
        voice: "en-US-natalie",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe("FALCON");
      expect(body.encodeAsBase64).toBeUndefined();
    });

    it("returns binary audio from stream response", async () => {
      const audioData = new Uint8Array([10, 20, 30]);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => audioData.buffer,
      });

      const provider = new MurfSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      const result = await provider.generate({
        modelId: "FALCON",
        text: "Hello",
        voice: "en-US-natalie",
      });

      expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
      expect(result.mediaType).toBe("audio/wav");
    });

    it("derives audio/pcm;rate=<hz> for format=PCM instead of trusting Content-Type", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        // FALCON streams raw PCM under a non-PCM/ratless Content-Type.
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      });

      const provider = new MurfSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      const result = await provider.generate({
        modelId: "FALCON",
        text: "Hello",
        voice: "en-US-natalie",
        providerOptions: { format: "PCM", sampleRate: 48_000 },
      });

      expect(result.mediaType).toBe("audio/pcm;rate=48000");
    });
  });
});
