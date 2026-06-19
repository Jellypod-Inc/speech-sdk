import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";

describe("CartesiaSpeechProvider", () => {
  it("calls the correct URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "sonic-2",
      text: "Hello world",
      voice: "voice-123",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.cartesia.ai/tts/bytes");
    expect(init.method).toBe("POST");
  });

  it("sends X-API-Key auth and Cartesia-Version headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "cartesia-key-123",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "sonic-2", text: "Hi" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers["X-API-Key"]).toBe("cartesia-key-123");
    expect(init.headers["Cartesia-Version"]).toBe("2025-04-16");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("sends correct body with nested voice object", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "sonic-2",
      text: "Hello world",
      voice: "voice-abc",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model_id).toBe("sonic-2");
    expect(body.transcript).toBe("Hello world");
    expect(body.voice).toEqual({ mode: "id", id: "voice-abc" });
    expect(body.output_format).toEqual({
      container: "wav",
      encoding: "pcm_f32le",
      sample_rate: 44_100,
    });
  });

  it("returns binary audio data and mediaType", async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "sonic-2",
      text: "Hello",
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe("audio/wav");
  });

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "sonic-2", text: "Hello" })
    ).rejects.toThrow();
  });

  it("uses custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "sonic-2", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.com/tts/bytes");
  });

  describe("processAudioTags", () => {
    it("passes [laughter] through for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[laughter] That was funny",
        "sonic-3"
      );
      expect(result.text).toBe("[laughter] That was funny");
      expect(result.warnings).toEqual([]);
    });

    it("transforms emotion tags to SSML for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[angry] How dare you!",
        "sonic-3"
      );
      expect(result.text).toBe('<emotion value="angry"/> How dare you!');
      expect(result.warnings).toEqual([]);
    });

    it("transforms multiple emotion tags for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[sad] I miss you. [happy] But I am glad you are here.",
        "sonic-3"
      );
      expect(result.text).toBe(
        '<emotion value="sad"/> I miss you. <emotion value="happy"/> But I am glad you are here.'
      );
      expect(result.warnings).toEqual([]);
    });

    it("handles case-insensitive emotion matching for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags("[Angry] Hello", "sonic-3");
      expect(result.text).toBe('<emotion value="angry"/> Hello');
    });

    it("strips unknown tags and warns for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[French accent] Bonjour",
        "sonic-3"
      );
      expect(result.text).toBe("Bonjour");
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("[French accent]");
      expect(result.warnings[0]).toContain("cartesia/sonic-3");
    });

    it("handles mix of supported and unsupported tags for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[angry] Hello [laughter] world [unknown tag] bye",
        "sonic-3"
      );
      expect(result.text).toBe(
        '<emotion value="angry"/> Hello [laughter] world bye'
      );
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain("[unknown tag]");
    });

    it("strips all tags for sonic-2", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[angry] Hello [laughter] world",
        "sonic-2"
      );
      expect(result.text).toBe("Hello world");
      expect(result.warnings).toHaveLength(2);
    });

    it("returns text unchanged when no tags present for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags("Hello world", "sonic-3");
      expect(result.text).toBe("Hello world");
      expect(result.warnings).toEqual([]);
    });

    it("passes transformed text to generate for sonic-3", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

      const provider = new CartesiaSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      const { text } = provider.processAudioTags(
        "[angry] How dare you! [laughter]",
        "sonic-3"
      );

      await provider.generate({
        modelId: "sonic-3",
        text,
        voice: "voice-123",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.transcript).toBe(
        '<emotion value="angry"/> How dare you! [laughter]'
      );
    });

    it("does not strip unclosed brackets for sonic-3", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "Score was [3-1 in the game",
        "sonic-3"
      );
      expect(result.text).toBe("Score was [3-1 in the game");
      expect(result.warnings).toEqual([]);
    });
  });

  it("spreads providerOptions into body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "sonic-2",
      text: "Hello",
      providerOptions: { output_format: { container: "wav" } },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.output_format).toEqual({ container: "wav" });
  });

  describe("sonic-3.5", () => {
    it("defaults to sonic-3.5", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      expect(provider.defaultModel).toBe("sonic-3.5");
    });

    it("registers sonic-3.5 with audio-tag, voice-cloning, and timestamp features", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const model = provider.models.find((m) => m.id === "sonic-3.5");
      expect(model).toBeDefined();
      expect(model?.features).toEqual([
        "streaming",
        "audio-tags",
        "voice-cloning",
        "timestamps",
      ]);
    });

    it("transforms emotion tags to SSML for sonic-3.5", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[angry] How dare you!",
        "sonic-3.5"
      );
      expect(result.text).toBe('<emotion value="angry"/> How dare you!');
      expect(result.warnings).toEqual([]);
    });

    it("passes [laughter] through for sonic-3.5", () => {
      const provider = new CartesiaSpeechProvider({ apiKey: "test-key" });
      const result = provider.processAudioTags(
        "[laughter] That was funny",
        "sonic-3.5"
      );
      expect(result.text).toBe("[laughter] That was funny");
      expect(result.warnings).toEqual([]);
    });

    it("sends sonic-3.5 as model_id in the request body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

      const provider = new CartesiaSpeechProvider({
        apiKey: "test-key",
        fetch: mockFetch,
      });

      await provider.generate({
        modelId: "sonic-3.5",
        text: "Hello",
        voice: "voice-123",
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model_id).toBe("sonic-3.5");
    });
  });
});
