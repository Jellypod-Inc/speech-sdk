import { describe, expect, it, vi } from "vitest";
import {
  createSpeechGateway,
  SpeechGatewayProvider,
} from "../providers/gateway/index.js";
import { isSpeechGatewayModel } from "../speech-provider.js";

const VOICE_REQUIRED_RE = /"voice" is required/;
const SIGNUP_RE = /https:\/\/wavform\.ai\//;

function mockFetchOk(body = new Uint8Array([1, 2, 3])) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "audio/mpeg",
    }),
    arrayBuffer: async () => body.buffer,
  });
}

function mockFetchJson(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({
      "content-type": "application/json",
    }),
    json: async () => body,
  });
}

describe("SpeechGatewayProvider", () => {
  it("posts inline-mode payload to the gateway with Bearer auth", async () => {
    const fetchFn = mockFetchOk();
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "openai/tts-1",
      text: "Hello",
      voice: "alloy",
      providerOptions: { speed: 1.2 },
    });

    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.audio).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.providerMetadata).toBeUndefined();

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.speechgateway.com/v1/audio/speech");
    expect(init.headers.Accept).toBe("audio/mpeg");
    expect(init.headers.Authorization).toBe("Bearer gw-key");
    expect(JSON.parse(init.body)).toEqual({
      mode: "inline",
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello",
      providerOptions: { speed: 1.2 },
    });
  });

  it("requests JSON and parses base64 audio when timestamps are requested", async () => {
    const fetchFn = mockFetchJson({
      audio: btoa("Hello"),
      mediaType: "audio/mpeg",
      timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
      warnings: ["timestamp alignment was approximate"],
      providerMetadata: {
        requestId: "gw-req-123",
      },
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "openai/tts-1",
      text: "Hello",
      voice: "alloy",
      includeTimestamps: true,
    });

    expect(result.audio).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.timestamps).toEqual([{ text: "Hello", start: 0, end: 0.4 }]);
    expect(result.warnings).toEqual(["timestamp alignment was approximate"]);
    expect(result.providerMetadata).toEqual({
      requestId: "gw-req-123",
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Accept).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      mode: "inline",
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello",
      timestamps: "on",
    });
  });

  it("sends timestamp auto mode to the gateway for JSON negotiation", async () => {
    const fetchFn = mockFetchJson({
      audio: btoa("Hello"),
      mediaType: "audio/mpeg",
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "openai/tts-1",
      text: "Hello",
      voice: "alloy",
      includeTimestamps: true,
      timestamps: "auto",
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Accept).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      mode: "inline",
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello",
      timestamps: "auto",
    });
  });

  it("identifies gateway-routed resolved models", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    expect(isSpeechGatewayModel(gateway("openai/tts-1"))).toBe(true);
  });

  it("does not let caller headers override gateway transport headers", async () => {
    const fetchFn = mockFetchJson({
      audio: btoa("Hello"),
      mediaType: "audio/mpeg",
      timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "openai/tts-1",
      text: "Hello",
      voice: "alloy",
      includeTimestamps: true,
      headers: {
        Accept: "audio/mpeg",
        Authorization: "Bearer caller-key",
        "Content-Type": "text/plain",
      },
    });

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Accept).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer gw-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
  });

  it("falls back to binary parsing when JSON timestamps are requested but audio is returned", async () => {
    const fetchFn = mockFetchOk();
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "openai/tts-1",
      text: "Hello",
      voice: "alloy",
      includeTimestamps: true,
    });

    expect(result.audio).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.timestamps).toBeUndefined();

    const [, init] = fetchFn.mock.calls[0];
    expect(init.headers.Accept).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual({
      mode: "inline",
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello",
      timestamps: "on",
    });
  });

  it("respects a custom baseURL", async () => {
    const fetchFn = mockFetchOk();
    const provider = new SpeechGatewayProvider({
      apiKey: "k",
      baseURL: "https://gateway.example.com/v1",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "elevenlabs/eleven_flash_v2_5",
      text: "Hi",
      voice: "rachel",
    });

    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe("https://gateway.example.com/v1/audio/speech");
  });

  it("throws when voice is missing", async () => {
    const provider = new SpeechGatewayProvider({
      apiKey: "k",
      fetch: mockFetchOk() as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({ modelId: "openai/tts-1", text: "Hi" })
    ).rejects.toThrow(VOICE_REQUIRED_RE);
  });

  it("does not derive provider metadata from streaming response headers", async () => {
    const body = new ReadableStream<Uint8Array>();
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      body,
      headers: new Headers({
        "content-type": "audio/mpeg",
      }),
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream({
      modelId: "openai/tts-1",
      text: "Hello",
      voice: "alloy",
    });

    expect(result.stream).toBe(body);
    expect(result.providerMetadata).toBeUndefined();
  });

  it("aggregates built-in provider models under namespaced ids", () => {
    const provider = new SpeechGatewayProvider({});
    const ids = provider.models.map((m) => m.id);
    expect(ids).toContain("openai/tts-1");
    expect(ids).toContain("elevenlabs/eleven_flash_v2_5");
  });

  it("factory createSpeechGateway returns a ResolvedModel with the default model", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    const resolved = gateway();
    expect(resolved.provider.id).toBe("speech-gateway");
    expect(resolved.modelId).toBe("openai/gpt-4o-mini-tts");
  });

  it("factory createSpeechGateway accepts an explicit modelId", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    const resolved = gateway("elevenlabs/eleven_flash_v2_5");
    expect(resolved.modelId).toBe("elevenlabs/eleven_flash_v2_5");
  });

  it("throws a signup-friendly error when no apiKey or env var is set", async () => {
    const savedKey = process.env.SPEECH_GATEWAY_API_KEY;
    process.env.SPEECH_GATEWAY_API_KEY = "";
    try {
      const provider = new SpeechGatewayProvider({});
      await expect(
        provider.generate({
          modelId: "openai/tts-1",
          text: "Hi",
          voice: "alloy",
        })
      ).rejects.toThrow(SIGNUP_RE);
    } finally {
      if (savedKey != null) {
        process.env.SPEECH_GATEWAY_API_KEY = savedKey;
      }
    }
  });
});
