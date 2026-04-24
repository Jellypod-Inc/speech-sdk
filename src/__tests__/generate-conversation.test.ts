import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
import type { SpeechProvider } from "../speech-provider.js";

const AT_LEAST_ONE_TURN_RE = /at least one turn/i;
const NATIVE_PROVIDER_OPTIONS_RE =
  /turns\[1\]\.providerOptions.*native dialogue path/;

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
    ).rejects.toThrow(AT_LEAST_ONE_TURN_RE);
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
    ).rejects.toThrow(NATIVE_PROVIDER_OPTIONS_RE);
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
    expect(body.model).toBe("openai/gpt-4o-mini-tts");
    expect(body.turns).toHaveLength(2);
    // No `timestamps` field on the wire.
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

  it('derives timestamps via STT when timestamps:"on" and conversation endpoint has no wire alignment', async () => {
    // The gateway conversation endpoint returns raw audio bytes only — no
    // per-turn alignment on the wire today. When the caller asks for word
    // timestamps, the SDK must derive them via STT over the mixed audio and
    // attribute them back to turns[].
    const bytes = new Uint8Array([65]);
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

    // STT stub that returns a token-per-word alignment for the input transcript.
    const transcribe = vi.fn().mockResolvedValue({
      timestamps: [
        { text: "Hi", start: 0, end: 0.1 },
        { text: "there.", start: 0.1, end: 0.3 },
        { text: "Hello!", start: 0.4, end: 0.6 },
      ],
    });

    await generateConversation({
      model: resolved,
      turns: [
        { voice: "alloy", text: "Hi there." },
        { voice: "nova", text: "Hello!" },
      ],
      timestamps: "on",
      timestampProvider: {
        provider: {
          id: "stub-stt",
          defaultModel: "stub",
          models: [],
          transcribe,
        },
        modelId: "stub",
      },
    });

    // No `timestamps` field on the wire anymore.
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.timestamps).toBeUndefined();
    // STT fallback ran because the caller asked for timestamps: "on".
    expect(transcribe).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 501 Not Implemented in the native path", async () => {
    // 501 is the gateway's "this capability will never work" signal (e.g.
    // timestamps: "on" on conversation). Retrying wastes round-trips.
    const error = new ApiError("Not implemented", {
      statusCode: 501,
      model: "native/m",
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
