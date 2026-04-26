import { describe, expect, it, vi } from "vitest";
import { ConversationInputError } from "../conversation/errors.js";
import { ApiError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
import type { SpeechProvider } from "../speech-provider.js";

function nativeProvider(): SpeechProvider {
  return {
    id: "native",
    defaultModel: "m",
    models: [],
    generate: vi.fn(),
    generateDialogue: vi.fn().mockResolvedValue({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: "audio/mpeg",
      audioDurationMs: 1000,
      providerMetadata: { requestId: "abc" },
    }),
    dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
  };
}

function stitchProvider(): SpeechProvider {
  const pcm = new Int16Array(2400);
  const bytes = new Uint8Array(pcm.buffer);
  return {
    id: "stitch",
    defaultModel: "m",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: "audio/pcm;rate=24000",
    }),
    getStitchOptions: () => ({
      providerOptions: { response_format: "pcm" },
      mediaType: "audio/pcm;rate=24000",
    }),
  };
}

describe("generateConversation", () => {
  it("routes to native path when provider supports dialogue and constraints hold", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
    });
    expect(provider.generateDialogue).toHaveBeenCalledTimes(1);
    expect(result.audio.uint8Array).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.metadata.provider).toBe("native");
    expect(result.metadata.model).toBe("m");
    expect(result.metadata.inputChars).toBe("Hi.".length + "Hello.".length);
    // Native provider with no getStitchOptions ⇒ normalization can't run, so
    // a warning surfaces (but the audio passes through untouched).
    expect(result.warnings?.length ?? 0).toBeGreaterThan(0);
  });

  it("normalizes the native dialogue output when the provider exposes a stitch mode", async () => {
    const pcm = new Int16Array(2400);
    pcm.fill(8000);
    const bytes = new Uint8Array(pcm.buffer);
    const provider: SpeechProvider = {
      id: "native-stitchable",
      defaultModel: "m",
      models: [],
      generate: vi.fn(),
      generateDialogue: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "Hello" },
      ],
    });

    // generateDialogue must have received the stitch-mode providerOptions
    // so the model returns decodable PCM.
    const dialogueCallArgs = (
      provider.generateDialogue as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(dialogueCallArgs.providerOptions).toEqual({
      response_format: "pcm",
    });

    // Output is the re-encoded WAV at the default -20 dBFS RMS target.
    expect(result.audio.mediaType).toBe("audio/wav");
    const wav = result.audio.uint8Array;
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(0)).toBe(0x52_49_46_46);
    expect(result.warnings).toBeUndefined();
  });

  it("skips native-path normalization when normalizeVolume:false", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "Hello" },
      ],
      normalizeVolume: false,
    });
    // No warning when the user explicitly opted out.
    expect(result.warnings).toBeUndefined();
    expect(result.audio.mediaType).toBe("audio/mpeg");
  });

  it("routes to stitch path when dialogue unsupported", async () => {
    const provider = stitchProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
      gapMs: 0,
    });
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(result.audio.mediaType).toBe("audio/wav");
  });

  it("rejects invalid inputs before any provider call", async () => {
    const provider = stitchProvider();
    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [],
      })
    ).rejects.toBeInstanceOf(ConversationInputError);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("forwards per-turn providerOptions to each generateSpeech call on the stitch path", async () => {
    const provider = stitchProvider();
    await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "hi", providerOptions: { speed: 0.9 } },
        {
          voice: "b",
          text: "hello",
          providerOptions: { speed: 1.1, seed: 42 },
        },
      ],
      gapMs: 0,
      normalizeVolume: false,
    });

    const calls = (provider.generate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // stitchProvider().getStitchOptions declares { response_format: "pcm" },
    // which is merged last so it always wins over caller-supplied keys.
    expect(calls[0][0].providerOptions).toEqual({
      speed: 0.9,
      response_format: "pcm",
    });
    expect(calls[1][0].providerOptions).toEqual({
      speed: 1.1,
      seed: 42,
      response_format: "pcm",
    });
  });

  it("rejects per-turn providerOptions on the native-dialogue path", async () => {
    const provider = nativeProvider();
    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hello.", providerOptions: { style: "casual" } },
        ],
      })
    ).rejects.toBeInstanceOf(ConversationInputError);
    expect(provider.generateDialogue).not.toHaveBeenCalled();
  });

  it("routes gateway-supported model through runGateway with a single HTTP call", async () => {
    const bytes = new Uint8Array([88, 89, 90]);
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => bytes.buffer,
    });
    const gateway = createSpeechGateway({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const resolved = gateway("openai/gpt-4o-mini-tts");

    const result = await generateConversation({
      model: resolved,
      turns: [
        { voice: "alloy", text: "Hi there." },
        { voice: "nova", text: "Hello!" },
      ],
    });

    // Exactly one HTTP call — no N-trip stitch path.
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.speechgateway.com/v1/audio/conversation");
    const body = JSON.parse(init.body);
    expect(body.mode).toBe("conversation");
    // Per-turn `model` on the wire; no top-level model.
    expect(body.model).toBeUndefined();
    expect(body.turns).toEqual([
      { model: "openai/gpt-4o-mini-tts", voice: "alloy", text: "Hi there." },
      { model: "openai/gpt-4o-mini-tts", voice: "nova", text: "Hello!" },
    ]);
    expect(body.timestamps).toBeUndefined();

    expect(result.audio.uint8Array).toEqual(new Uint8Array([88, 89, 90]));
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.metadata.provider).toBe("speech-gateway");
    expect(result.metadata.model).toBe("openai/gpt-4o-mini-tts");
    // Per-turn attribution is reconstructed from the caller's input (server
    // no longer returns it on the wire — it's logged server-side only).
    expect(result.providerMetadata).toEqual({
      turns: [
        { provider: "openai", model: "gpt-4o-mini-tts", voice: "alloy" },
        { provider: "openai", model: "gpt-4o-mini-tts", voice: "nova" },
      ],
    });
    expect(result.warnings).toBeUndefined();
  });

  it("reuses the top-level string model so gateway conversations stay on the one-call path", async () => {
    const bytes = new Uint8Array([88, 89, 90]);
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => bytes.buffer,
    });

    const savedFetch = globalThis.fetch;
    globalThis.fetch = fetchFn as unknown as typeof globalThis.fetch;
    try {
      const result = await generateConversation({
        model: "openai/gpt-4o-mini-tts",
        apiKey: "gw-key",
        turns: [
          { voice: "alloy", text: "Hi there." },
          { voice: "nova", text: "Hello!" },
        ],
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe("https://api.speechgateway.com/v1/audio/conversation");
      const body = JSON.parse(init.body);
      expect(body.model).toBeUndefined();
      expect(body.turns).toEqual([
        { model: "openai/gpt-4o-mini-tts", voice: "alloy", text: "Hi there." },
        { model: "openai/gpt-4o-mini-tts", voice: "nova", text: "Hello!" },
      ]);
      expect(result.metadata.provider).toBe("speech-gateway");
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("routes timestamps:true to /with-timestamps and uses server-attributed words", async () => {
    // The gateway's /v1/audio/conversation/with-timestamps endpoint returns a
    // JSON envelope with base64 audio + per-word timestamps already attributed
    // to turns via `turnIndex`. The SDK must hit that URL, send
    // `timestamps: "on"` in the body, and surface those timestamps directly —
    // no client-side STT.
    const audioBytes = new Uint8Array([65]);
    const audioBase64 =
      typeof btoa === "function"
        ? btoa(String.fromCharCode(...audioBytes))
        : Buffer.from(audioBytes).toString("base64");
    const wirePayload = {
      audio: audioBase64,
      mediaType: "audio/wav",
      warnings: [],
      timestamps: [
        { text: "Hi", start: 0, end: 0.1, turnIndex: 0 },
        { text: "there.", start: 0.1, end: 0.3, turnIndex: 0 },
        { text: "Hello!", start: 0.4, end: 0.6, turnIndex: 1 },
      ],
    };
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => wirePayload,
    });
    const gateway = createSpeechGateway({
      apiKey: "gw-key",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const resolved = gateway("openai/gpt-4o-mini-tts");

    // STT stub — must NOT be called when going through the gateway.
    const transcribe = vi.fn();

    const result = await generateConversation({
      model: resolved,
      turns: [
        { voice: "alloy", text: "Hi there." },
        { voice: "nova", text: "Hello!" },
      ],
      timestamps: true,
    });

    expect(transcribe).not.toHaveBeenCalled();

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://api.speechgateway.com/v1/audio/conversation/with-timestamps"
    );
    const body = JSON.parse(init.body);
    // URL split signals timestamps; no body field needed (defaults to "on" server-side).
    expect(body.timestamps).toBeUndefined();

    expect(result.timestamps).toEqual([
      { text: "Hi", start: 0, end: 0.1, turnIndex: 0 },
      { text: "there.", start: 0.1, end: 0.3, turnIndex: 0 },
      { text: "Hello!", start: 0.4, end: 0.6, turnIndex: 1 },
    ]);
  });

  it("does not retry on 501 Not Implemented in the native path", async () => {
    // 501 is the gateway's "this capability will never work" signal (e.g.
    // timestamps: "on" on conversation). Retrying wastes round-trips.
    const error = new ApiError("Not implemented", {
      statusCode: 501,
      code: "timestamps_unsupported",
    });
    const provider: SpeechProvider = {
      id: "native",
      defaultModel: "m",
      models: [],
      generate: vi.fn(),
      generateDialogue: vi.fn().mockRejectedValue(error),
      dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
    };

    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hello." },
        ],
        maxRetries: 2,
      })
    ).rejects.toThrow();
    expect(provider.generateDialogue).toHaveBeenCalledTimes(1);
  });
});
