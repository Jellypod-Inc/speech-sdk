import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { GradiumSpeechProvider } from "../providers/gradium/index.js";

describe("GradiumSpeechProvider", () => {
  it("calls the TTS POST endpoint with Gradium auth and raw-audio body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new GradiumSpeechProvider({
      apiKey: "gradium-test",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "default",
      text: "Your morning briefing is ready.",
      voice: "cLONiZ4hQ8VpQ4Sz",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.gradium.ai/api/post/speech/tts");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("gradium-test");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);

    expect(JSON.parse(init.body)).toEqual({
      output_format: "wav",
      model_name: "default",
      text: "Your morning briefing is ready.",
      voice_id: "cLONiZ4hQ8VpQ4Sz",
      only_audio: true,
    });
  });

  it("sends providerOptions through with native Gradium field names", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/octet-stream" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    const provider = new GradiumSpeechProvider({
      apiKey: "test",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "default",
      text: "Hi",
      voice: "voice-1",
      providerOptions: {
        output_format: "pcm_24000",
        pronunciation_id: "pron-1",
        json_config: { speed: 1.1 },
      },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      output_format: "pcm_24000",
      pronunciation_id: "pron-1",
      json_config: { speed: 1.1 },
      model_name: "default",
      text: "Hi",
      voice_id: "voice-1",
      only_audio: true,
    });
    expect(result.mediaType).toBe("audio/pcm;rate=24000");
  });

  it("uses custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    const provider = new GradiumSpeechProvider({
      apiKey: "test",
      baseURL: "https://proxy.example/api",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "default",
      text: "Hi",
      voice: "voice-1",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://proxy.example/api/post/speech/tts");
  });

  it("derives default wav media type when Gradium returns a generic content type", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/octet-stream" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    const provider = new GradiumSpeechProvider({
      apiKey: "test",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "default",
      text: "Hi",
      voice: "voice-1",
    });

    expect(result.mediaType).toBe("audio/wav");
  });

  it("requires a Gradium voice id", async () => {
    const provider = new GradiumSpeechProvider({
      apiKey: "test",
      fetch: vi.fn(),
    });

    await expect(
      provider.generate({ modelId: "default", text: "Hello" })
    ).rejects.toThrow('"voice" is required');
  });

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"detail": "invalid api key"}',
    });
    const provider = new GradiumSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({
        modelId: "default",
        text: "Hello",
        voice: "voice-1",
      })
    ).rejects.toThrow("API error 401");
  });
});
