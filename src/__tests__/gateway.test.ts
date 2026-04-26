import { describe, expect, it, vi } from "vitest";
import { ApiError, GatewayInputError, MissingApiKeyError } from "../errors.js";
import {
  createSpeechGateway,
  SpeechGatewayProvider,
} from "../providers/gateway/index.js";
import { isSpeechGatewayModel } from "../speech-provider.js";

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

function mockFetchAudio(body: Uint8Array, contentType: string) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": contentType }),
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
    expect(init.headers.Authorization).toBe("Bearer gw-key");
    expect(JSON.parse(init.body)).toEqual({
      mode: "inline",
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello",
      providerOptions: { speed: 1.2 },
    });
  });

  it("hits /audio/speech/with-timestamps and parses base64 audio when timestamps are requested", async () => {
    const fetchFn = mockFetchJson({
      audio: btoa("Hello"),
      mediaType: "audio/mpeg",
      timestamps: [{ text: "Hello", start: 0, end: 0.4 }],
      warnings: ["timestamp alignment was approximate"],
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

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://api.speechgateway.com/v1/audio/speech/with-timestamps"
    );
    // URL split is the timestamps switch; body carries no `timestamps` field.
    expect(JSON.parse(init.body)).toEqual({
      mode: "inline",
      model: "openai/tts-1",
      voice: "alloy",
      text: "Hello",
    });
  });

  it("defaults missing warnings/timestamps in the JSON envelope to empty arrays", async () => {
    const fetchFn = mockFetchJson({
      audio: btoa("Hello"),
      mediaType: "audio/mpeg",
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

    expect(result.timestamps).toEqual([]);
    expect(result.warnings).toEqual([]);
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
      warnings: [],
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
    expect(init.headers.Authorization).toBe("Bearer gw-key");
    expect(init.headers["Content-Type"]).toBe("application/json");
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
    ).rejects.toBeInstanceOf(GatewayInputError);
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

  it("has an empty models array — gateway server is the source of truth for model capabilities", () => {
    const provider = new SpeechGatewayProvider({});
    expect(provider.models).toEqual([]);
  });

  it("does not expose a processAudioTags method — gateway server handles tag normalization", () => {
    const provider = new SpeechGatewayProvider({});
    expect(provider.processAudioTags).toBeUndefined();
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

  it("throws a signup-friendly 401 error when the gateway rejects the key", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ error: "unauthorized" }),
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({
        modelId: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
      })
    ).rejects.toMatchObject({ name: "ApiError", statusCode: 401 });
  });

  it("extracts RFC 7807 problem+json code into ApiError.code on 501", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 501,
      headers: new Headers({ "content-type": "application/problem+json" }),
      text: async () =>
        JSON.stringify({
          type: "about:blank",
          title: "ServiceError",
          status: 501,
          detail: 'timestamps: "on" is not supported for this model',
          code: "timestamps_unsupported",
        }),
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({
        modelId: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      statusCode: 501,
      code: "timestamps_unsupported",
    });
  });

  it("leaves ApiError.code undefined when error body has no code field", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ error: "bad request" }),
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    let thrown: unknown;
    try {
      await provider.generate({
        modelId: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    const apiError = thrown as ApiError;
    expect(apiError.statusCode).toBe(400);
    expect(apiError.code).toBeUndefined();
  });

  it("handles non-JSON error bodies without throwing during code extraction", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers({ "content-type": "text/plain" }),
      text: async () => "Internal Server Error",
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    let thrown: unknown;
    try {
      await provider.generate({
        modelId: "openai/tts-1",
        text: "Hello",
        voice: "alloy",
      });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(ApiError);
    const apiError = thrown as ApiError;
    expect(apiError.statusCode).toBe(500);
    expect(apiError.code).toBeUndefined();
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
      ).rejects.toBeInstanceOf(MissingApiKeyError);
    } finally {
      if (savedKey != null) {
        process.env.SPEECH_GATEWAY_API_KEY = savedKey;
      }
    }
  });
});

describe("SpeechGatewayProvider.generateConversation", () => {
  it("posts conversation payload with mode, per-turn model, gap/volume/normalize defaults; reads raw mixed audio", async () => {
    const fetchFn = mockFetchAudio(new Uint8Array([65, 66, 67]), "audio/wav");
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generateConversation({
      turns: [
        { model: "openai/gpt-4o-mini-tts", voice: "alloy", text: "Hi." },
        { model: "elevenlabs/eleven_v3", voice: "rachel", text: "Hello!" },
      ],
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.speechgateway.com/v1/audio/conversation");
    expect(init.headers.Authorization).toBe("Bearer gw-key");
    expect(init.headers["Content-Type"]).toBe("application/json");

    // Per-turn `model` on the wire, no top-level model; timestamps live on a separate URL.
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      mode: "conversation",
      turns: [
        { model: "openai/gpt-4o-mini-tts", voice: "alloy", text: "Hi." },
        { model: "elevenlabs/eleven_v3", voice: "rachel", text: "Hello!" },
      ],
      gapMs: 300,
      volumeDbfs: -20,
      normalizeVolume: true,
    });

    expect(result.audio).toEqual(new Uint8Array([65, 66, 67]));
    expect(result.mediaType).toBe("audio/wav");
  });

  it("surfaces problem+json `code` on error responses", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers({ "content-type": "application/problem+json" }),
      text: async () =>
        JSON.stringify({
          type: "about:blank",
          title: "ValidationError",
          status: 400,
          detail: "conversation input invalid",
          code: "conversation_input_invalid",
        }),
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generateConversation({
        turns: [
          { model: "openai/gpt-4o-mini-tts", voice: "alloy", text: "Hi." },
        ],
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      statusCode: 400,
      code: "conversation_input_invalid",
    });
  });

  it("rewrites 401 to signup-friendly message on conversation", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ error: "unauthorized" }),
    });
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generateConversation({
        turns: [
          { model: "openai/gpt-4o-mini-tts", voice: "alloy", text: "Hi." },
        ],
      })
    ).rejects.toMatchObject({ name: "ApiError", statusCode: 401 });
  });

  it("rejects empty turns array client-side", async () => {
    const fetchFn = mockFetchAudio(new Uint8Array([65]), "audio/wav");
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generateConversation({
        turns: [],
      })
    ).rejects.toBeInstanceOf(GatewayInputError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects turns missing voice client-side", async () => {
    const fetchFn = mockFetchAudio(new Uint8Array([65]), "audio/wav");
    const provider = new SpeechGatewayProvider({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generateConversation({
        turns: [{ model: "openai/gpt-4o-mini-tts", voice: "", text: "Hi." }],
      })
    ).rejects.toBeInstanceOf(GatewayInputError);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
