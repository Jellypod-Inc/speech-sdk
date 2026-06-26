import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { SmallestAISpeechProvider } from "../providers/smallest-ai/index.js";

describe("SmallestAISpeechProvider", () => {
  it("calls the correct URL for the default model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1",
      text: "Hello world",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://waves-api.smallest.ai/api/v1/lightning-v3.1/get_speech"
    );
    expect(init.method).toBe("POST");
  });

  it("sends text and defaults in request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1",
      text: "Hello",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text).toBe("Hello");
    expect(body.voice_id).toBe("magnus");
    expect(body.language).toBe("auto");
    expect(body.output_format).toBe("wav");
    expect(body.model).toBe("lightning_v3.1");
  });

  it("uses provided voice_id", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1",
      text: "Hello",
      voice: "olivia",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.voice_id).toBe("olivia");
  });

  it("sends Bearer auth header and SDK user agent", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "sk-test-123",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "lightning_v3.1", text: "Hi" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sk-test-123");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.headers["X-Source"]).toBe("jellypod-speech-sdk");
  });

  it("returns audio bytes and wav mediaType by default", async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "lightning_v3.1",
      text: "Hello",
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe("audio/wav");
  });

  it("derives mediaType from the requested format, ignoring the wav header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      // get_speech always reports audio/wav even when it returns mp3 bytes.
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "lightning_v3.1",
      text: "Hello",
      providerOptions: { output_format: "mp3" },
    });

    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("passes providerOptions through to request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1",
      text: "Hello",
      providerOptions: { sample_rate: 24_000, speed: 1.5, language: "hi" },
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.sample_rate).toBe(24_000);
    expect(body.speed).toBe(1.5);
    expect(body.language).toBe("hi");
  });

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "lightning_v3.1", text: "Hello" })
    ).rejects.toThrow();
  });

  it("uses custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/waves/v1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "lightning_v3.1", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.com/waves/v1/lightning-v3.1/get_speech");
  });

  it("getStitchOptions returns wav config for known model", () => {
    const provider = new SmallestAISpeechProvider({ apiKey: "test-key" });
    const opts = provider.getStitchOptions("lightning_v3.1");
    expect(opts).toEqual({
      providerOptions: { output_format: "wav" },
      mediaType: "audio/wav",
    });
  });

  it("getStitchOptions returns undefined for unknown model", () => {
    const provider = new SmallestAISpeechProvider({ apiKey: "test-key" });
    expect(provider.getStitchOptions("unknown-model")).toBeUndefined();
  });
});

describe("SmallestAISpeechProvider — lightning_v3.1_pro", () => {
  it("calls the lightning-v3.1 get_speech endpoint for the pro model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1_pro",
      text: "Hello from Pro",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://waves-api.smallest.ai/api/v1/lightning-v3.1/get_speech"
    );
  });

  it("sets model field in body for pro model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1_pro",
      text: "Hello",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("lightning_v3.1_pro");
  });

  it("defaults voice to meher for pro model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1_pro",
      text: "Hello",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.voice_id).toBe("meher");
  });

  it("uses custom voice when provided for pro model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "lightning_v3.1_pro",
      text: "Hello",
      voice: "benedict",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.voice_id).toBe("benedict");
  });

  it("respects custom baseURL for pro model", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/waves/v1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "lightning_v3.1_pro", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.com/waves/v1/lightning-v3.1/get_speech");
  });

  it("getStitchOptions returns wav config for pro model", () => {
    const provider = new SmallestAISpeechProvider({ apiKey: "test-key" });
    const opts = provider.getStitchOptions("lightning_v3.1_pro");
    expect(opts).toEqual({
      providerOptions: { output_format: "wav" },
      mediaType: "audio/wav",
    });
  });
});
