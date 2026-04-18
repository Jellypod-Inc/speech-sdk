import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

const MISSING_API_KEY_PATTERN = /Inworld API key is required/;
const MISSING_AUDIO_CONTENT_PATTERN = /missing audioContent/;

function base64(bytes: number[]): string {
  let binary = "";
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

describe("InworldSpeechProvider", () => {
  it("calls the sync endpoint with POST", async () => {
    const audioContent = base64([1, 2, 3]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hello world",
      voice: "Ashley",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.inworld.ai/tts/v1/voice");
    expect(init.method).toBe("POST");
  });

  it("sends Basic auth header with the API key", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent: base64([1]) }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "inworld-key-abc",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Basic inworld-key-abc");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("sends body with text, voice_id, model_id, and default audio_config", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent: base64([1]) }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "inworld-tts-1.5-mini",
      text: "Hello world",
      voice: "Craig",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.text).toBe("Hello world");
    expect(body.voice_id).toBe("Craig");
    expect(body.model_id).toBe("inworld-tts-1.5-mini");
    expect(body.audio_config).toEqual({
      audio_encoding: "MP3",
      sample_rate_hertz: 48_000,
    });
  });

  it("decodes base64 audio and returns audio/mpeg by default", async () => {
    const audioBytes = [10, 20, 30, 40];
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent: base64(audioBytes) }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
    });

    expect(typeof result.audio).toBe("string");
    expect(result.audio).toBe(base64(audioBytes));
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("returns audio/wav when audio_encoding is LINEAR16", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent: base64([1]) }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
      providerOptions: {
        audio_config: { audio_encoding: "LINEAR16", sample_rate_hertz: 24_000 },
      },
    });

    expect(result.mediaType).toBe("audio/wav");
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.audio_config).toEqual({
      audio_encoding: "LINEAR16",
      sample_rate_hertz: 24_000,
    });
  });

  it("merges providerOptions into the body alongside text/model_id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent: base64([1]) }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
      providerOptions: { temperature: 0.7 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.7);
    expect(body.text).toBe("Hi");
    expect(body.model_id).toBe("inworld-tts-1.5-max");
  });

  it("uses a custom baseURL when provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ audioContent: base64([1]) }),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.inworld.example",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "inworld-tts-1.5-max",
      text: "Hi",
      voice: "Ashley",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.inworld.example/tts/v1/voice");
  });

  it("throws when API key is missing and no env var set", async () => {
    const provider = new InworldSpeechProvider({
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });

    const original = process.env.INWORLD_API_KEY;
    Reflect.deleteProperty(process.env, "INWORLD_API_KEY");
    try {
      await expect(
        provider.generate({
          modelId: "inworld-tts-1.5-max",
          text: "Hi",
          voice: "Ashley",
        })
      ).rejects.toThrow(MISSING_API_KEY_PATTERN);
    } finally {
      if (original !== undefined) {
        process.env.INWORLD_API_KEY = original;
      }
    }
  });

  it("throws on a non-2xx response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new InworldSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({
        modelId: "inworld-tts-1.5-max",
        text: "Hello",
        voice: "Ashley",
      })
    ).rejects.toThrow();
  });

  it("throws when audioContent is missing from the response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({}),
    });

    const provider = new InworldSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({
        modelId: "inworld-tts-1.5-max",
        text: "Hello",
        voice: "Ashley",
      })
    ).rejects.toThrow(MISSING_AUDIO_CONTENT_PATTERN);
  });

  it("declares both 1.5 max and mini models with the streaming feature", () => {
    const provider = new InworldSpeechProvider({ apiKey: "test-key" });
    const ids = provider.models.map((m) => m.id);
    expect(ids).toContain("inworld-tts-1.5-max");
    expect(ids).toContain("inworld-tts-1.5-mini");
    for (const m of provider.models) {
      expect(m.features).toContain("streaming");
    }
  });

  it("exposes the expected default model and id", () => {
    const provider = new InworldSpeechProvider({ apiKey: "test-key" });
    expect(provider.id).toBe("inworld");
    expect(provider.defaultModel).toBe("inworld-tts-1.5-max");
  });
});
