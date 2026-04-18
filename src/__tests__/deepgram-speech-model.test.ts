import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";

describe("DeepgramSpeechProvider", () => {
  it("calls the correct URL with model+voice in query param", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "aura-2",
      text: "Hello world",
      voice: "thalia-en",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en"
    );
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.text).toBe("Hello world");
  });

  it("uses modelId alone when no voice is provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "aura-2", text: "Hi" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.deepgram.com/v1/speak?model=aura-2");
  });

  it("sends Token auth header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "dg-test-123",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "aura-2", text: "Hi" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Token dg-test-123");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("returns audio data and mediaType", async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "aura-2",
      text: "Hello",
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "aura-2", text: "Hello" })
    ).rejects.toThrow();
  });

  it("uses custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/v1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "aura-2", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.com/v1/speak?model=aura-2");
  });

  it("spreads providerOptions into body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new DeepgramSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "aura-2",
      text: "Hello",
      providerOptions: { sample_rate: 24_000 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sample_rate).toBe(24_000);
  });
});
