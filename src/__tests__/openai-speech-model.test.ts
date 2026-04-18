import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";

describe("OpenAISpeechProvider", () => {
  it("calls the correct URL with correct body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "tts-1",
      text: "Hello world",
      voice: "alloy",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("tts-1");
    expect(body.input).toBe("Hello world");
    expect(body.voice).toBe("alloy");
  });

  it("sends authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "sk-test-123",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "tts-1", text: "Hi" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sk-test-123");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("maps providerOptions to request body", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "gpt-4o-mini-tts",
      text: "Hello",
      voice: "nova",
      providerOptions: {
        speed: 1.5,
        instructions: "Speak slowly",
        response_format: "wav",
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.speed).toBe(1.5);
    expect(body.instructions).toBe("Speak slowly");
    expect(body.response_format).toBe("wav");
  });

  it("returns audio data and mediaType", async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "tts-1",
      text: "Hello",
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("throws ApiError on non-ok response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "tts-1", text: "Hello" })
    ).rejects.toThrow();
  });

  it("uses custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "test-key",
      baseURL: "https://my-proxy.com/v1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "tts-1", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://my-proxy.com/v1/audio/speech");
  });

  it("merges additional headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "tts-1",
      text: "Hello",
      headers: { "X-Request-Id": "abc-123" },
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers["X-Request-Id"]).toBe("abc-123");
  });
});

describe("OpenAISpeechProvider.processAudioTags", () => {
  const provider = new OpenAISpeechProvider({ apiKey: "test" });

  it("passes text through unchanged for gpt-4o-mini-tts", () => {
    const r = provider.processAudioTags(
      "[cheerfully] Hi John [soft] I'm great",
      "gpt-4o-mini-tts"
    );
    expect(r.text).toBe("[cheerfully] Hi John [soft] I'm great");
    expect(r.warnings).toEqual([]);
  });

  it("strips tags and warns for tts-1", () => {
    const r = provider.processAudioTags("[laugh] Hello", "tts-1");
    expect(r.text).toBe("Hello");
    expect(r.warnings).toEqual([
      "Audio tag [laugh] is not supported by openai/tts-1 and was removed.",
    ]);
  });

  it("strips tags and warns for tts-1-hd", () => {
    const r = provider.processAudioTags("[laugh] Hello", "tts-1-hd");
    expect(r.text).toBe("Hello");
    expect(r.warnings).toHaveLength(1);
  });
});

describe("OpenAISpeechProvider.generate with audio tags", () => {
  function mockFetch(): typeof globalThis.fetch {
    return vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "audio/mpeg" },
        })
    ) as unknown as typeof globalThis.fetch;
  }

  it("extracts tags into instructions and sends cleaned input for gpt-4o-mini-tts", async () => {
    const fetchFn = mockFetch();
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch: fetchFn });

    await provider.generate({
      modelId: "gpt-4o-mini-tts",
      text: "[cheerfully] Hi John how are you? [soft] I'm feeling great",
      voice: "alloy",
    });

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.input).toBe("Hi John how are you? I'm feeling great");
    expect(body.instructions).toBe(
      "Delivery shifts through the text in order: begin cheerfully, then soft."
    );
    expect(body.model).toBe("gpt-4o-mini-tts");
    expect(body.voice).toBe("alloy");
  });

  it("prepends user-supplied providerOptions.instructions before tag-derived instructions", async () => {
    const fetchFn = mockFetch();
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch: fetchFn });

    await provider.generate({
      modelId: "gpt-4o-mini-tts",
      text: "[cheerfully] Hi John",
      voice: "alloy",
      providerOptions: { instructions: "Speak with an English accent." },
    });

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.input).toBe("Hi John");
    expect(body.instructions).toBe(
      "Speak with an English accent.\n\nSpeak cheerfully."
    );
  });

  it("passes through text unchanged when no tags are present", async () => {
    const fetchFn = mockFetch();
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch: fetchFn });

    await provider.generate({
      modelId: "gpt-4o-mini-tts",
      text: "Hi John",
      voice: "alloy",
    });

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.input).toBe("Hi John");
    expect(body.instructions).toBeUndefined();
  });

  it("does not parse tags for tts-1 (stripping already happened upstream via processAudioTags)", async () => {
    const fetchFn = mockFetch();
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch: fetchFn });

    await provider.generate({
      modelId: "tts-1",
      text: "Hello world", // already stripped
      voice: "alloy",
    });

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.input).toBe("Hello world");
    expect(body.instructions).toBeUndefined();
  });

  it("forwards user-supplied providerOptions.instructions for tts-1", async () => {
    const fetchFn = mockFetch();
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch: fetchFn });

    await provider.generate({
      modelId: "tts-1",
      text: "Hello world",
      voice: "alloy",
      providerOptions: { instructions: "Speak slowly." },
    });

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.input).toBe("Hello world");
    expect(body.instructions).toBe("Speak slowly.");
  });
});
