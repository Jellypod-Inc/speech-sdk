import { describe, expect, it, vi } from "vitest";
import { ConversationInputError } from "../conversation/errors.js";
import { ApiError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
import type { SpeechProvider } from "../speech-provider.js";

const NATIVE_FALLBACK_WARNING_RE = /native dialogue unavailable/;
const SINGLE_SPEAKER_FALLBACK_RE = /single speaker/;
const TOO_MANY_VOICES_FALLBACK_RE = /more unique voices/;
const NATIVE_FALLBACK_CALL_COUNT_RE = /2 API calls instead of 1/;
const STITCH_UNSUPPORTED_RE = /cannot be used in a stitched conversation/;
const WHITESPACE_RE = /\s+/;

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
    dialogueCapabilities: () => ({ maxVoices: 10 }),
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

// Gemini-shaped: native multi-speaker dialogue requiring exactly 2 unique voices,
// plus a decodable PCM stitch mode so the single-voice fallback can render per-turn.
function geminiLikeProvider(): SpeechProvider {
  const pcm = new Int16Array(2400);
  pcm.fill(4000);
  const bytes = new Uint8Array(pcm.buffer);
  return {
    id: "google",
    defaultModel: "gemini-3.1-flash-tts-preview",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: "audio/pcm;rate=24000",
      timestamps: [
        { text: "word", start: 0, end: 0.05 },
        { text: "two", start: 0.05, end: 0.1 },
      ],
    }),
    generateDialogue: vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: "audio/pcm;rate=24000",
    }),
    dialogueCapabilities: () => ({ maxVoices: 2 }),
    getStitchOptions: () => ({
      providerOptions: { audio_config: { sample_rate_hertz: 24_000 } },
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
    expect(result.metadata.inputChars).toBe("Hi.".length + "Hello.".length);
    // Native dialogue path has no per-turn boundaries — perTurn is undefined.
    expect(result.metadata.perTurn).toBeUndefined();
    // Native provider lacks getStitchOptions, so normalization can't run and emits a warning.
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
      dialogueCapabilities: () => ({ maxVoices: 10 }),
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

    const dialogueCallArgs = (
      provider.generateDialogue as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(dialogueCallArgs.providerOptions).toEqual({
      response_format: "pcm",
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    const wav = result.audio.uint8Array;
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(0)).toBe(0x52_49_46_46);
    expect(result.warnings).toBeUndefined();
  });

  it("uses stitch when maxInputChars requires chunking even if native dialogue is available", async () => {
    const pcm = new Int16Array(2400);
    const bytes = new Uint8Array(pcm.buffer);
    const provider: SpeechProvider = {
      id: "native-stitchable",
      defaultModel: "m",
      models: [],
      generate: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      generateDialogue: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      dialogueCapabilities: () => ({ maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [{ voice: "a", text: "First sentence. Second sentence." }],
      maxInputChars: 16,
      gapMs: 0,
    });

    expect(provider.generateDialogue).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ text: "First sentence." })
    );
    expect(provider.generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "Second sentence." })
    );
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.metadata.perTurn).toHaveLength(1);
  });

  it("uses stitch when untrimmed text exceeds maxInputChars", async () => {
    const pcm = new Int16Array(2400);
    const bytes = new Uint8Array(pcm.buffer);
    const provider: SpeechProvider = {
      id: "native-stitchable",
      defaultModel: "m",
      models: [],
      generate: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      generateDialogue: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      dialogueCapabilities: () => ({ maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    await generateConversation({
      model: { provider, modelId: "m" },
      turns: [{ voice: "a", text: "  First sentence. " }],
      maxInputChars: 16,
      gapMs: 0,
    });

    expect(provider.generateDialogue).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("falls back to per-turn stitch when all turns share one voice on a max-2-voice native provider", async () => {
    const provider = geminiLikeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns: [
        { voice: "a", text: "Hi there." },
        { voice: "a", text: "Hello again." },
      ],
    });

    expect(provider.generateDialogue).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(
      result.warnings?.some((w) => SINGLE_SPEAKER_FALLBACK_RE.test(w))
    ).toBe(true);
  });

  it("still uses the native dialogue path for 2 distinct voices on a max-2-voice provider", async () => {
    const provider = geminiLikeProvider();
    await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns: [
        { voice: "a", text: "Hi there." },
        { voice: "b", text: "Hello back." },
      ],
    });

    expect(provider.generateDialogue).toHaveBeenCalledTimes(1);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it("renders 3 unique voices via per-turn stitch instead of throwing on a max-2-voice provider", async () => {
    const provider = geminiLikeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns: [
        { voice: "a", text: "Hello there." },
        { voice: "b", text: "General reply." },
        { voice: "c", text: "Kenobi." },
      ],
    });

    expect(provider.generateDialogue).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledTimes(3);
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(
      result.warnings?.some((w) => TOO_MANY_VOICES_FALLBACK_RE.test(w))
    ).toBe(true);
  });

  it("returns timestamps on the single-voice fallback path when requested", async () => {
    const provider = geminiLikeProvider();
    const timestampProvider = {
      align: vi.fn().mockImplementation(({ text }: { text: string }) =>
        Promise.resolve(
          text.split(WHITESPACE_RE).map((word, index) => ({
            text: word,
            start: index * 0.02,
            end: (index + 1) * 0.02,
          }))
        )
      ),
    };
    const result = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns: [
        { voice: "a", text: "Hi there." },
        { voice: "a", text: "Hello again." },
      ],
      timestamps: true,
      timestampProvider,
    });

    expect(provider.generateDialogue).not.toHaveBeenCalled();
    expect(result.timestamps).toBeDefined();
    expect(result.timestamps?.length).toBeGreaterThan(0);
    // Per-turn attribution is preserved across the stitched monologue.
    expect(new Set(result.timestamps?.map((t) => t.turnIndex))).toEqual(
      new Set([0, 1])
    );
  });

  it("honors gapMs, speed, and output on the single-voice fallback path", async () => {
    const provider = geminiLikeProvider();
    const turns = [
      { voice: "a", text: "Hi there." },
      { voice: "a", text: "Hello again." },
    ];

    const noGap = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns,
      gapMs: 0,
    });
    const withGap = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns,
      gapMs: 1000,
    });
    expect(withGap.metadata.audioDurationMs ?? 0).toBeGreaterThan(
      noGap.metadata.audioDurationMs ?? 0
    );

    const fast = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns,
      gapMs: 0,
      speed: 1.5,
    });
    expect(fast.metadata.audioDurationMs ?? 0).toBeLessThan(
      noGap.metadata.audioDurationMs ?? 0
    );

    const pcm = await generateConversation({
      model: { provider, modelId: "gemini-3.1-flash-tts-preview" },
      turns,
      output: { format: "pcm" },
    });
    expect(pcm.audio.mediaType.startsWith("audio/pcm")).toBe(true);
  });

  it("splits an over-limit native dialogue into parallel blocks and stitches one result", async () => {
    const pcm = new Int16Array(2400);
    pcm.fill(6000);
    const bytes = new Uint8Array(pcm.buffer);
    const generateDialogue = vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: "audio/pcm;rate=24000",
      providerMetadata: { requestId: "blk" },
    });
    const provider: SpeechProvider = {
      id: "native-split",
      defaultModel: "m",
      models: [],
      generate: vi.fn(),
      generateDialogue,
      dialogueCapabilities: () => ({
        maxVoices: 2,
        maxTotalChars: 12,
      }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "Yo" },
        { voice: "a", text: "Hello" },
        { voice: "b", text: "World" },
        { voice: "a", text: "Foo" },
        { voice: "b", text: "Bar" },
      ],
      gapMs: 0,
    });

    // Two native-dialogue calls (one per block), each carrying its block's turns.
    expect(generateDialogue).toHaveBeenCalledTimes(2);
    const firstBlockTurns = generateDialogue.mock.calls[0][0].turns;
    const secondBlockTurns = generateDialogue.mock.calls[1][0].turns;
    expect(firstBlockTurns.map((t: { text: string }) => t.text)).toEqual([
      "Hi",
      "Yo",
      "Hello",
    ]);
    expect(secondBlockTurns.map((t: { text: string }) => t.text)).toEqual([
      "World",
      "Foo",
      "Bar",
    ]);

    // Decodable blocks stitch into a single WAV with no fallback warning.
    expect(result.audio.mediaType).toBe("audio/wav");
    const wav = result.audio.uint8Array;
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(0)).toBe(0x52_49_46_46);
    expect(result.metadata.inputChars).toBe(20);
    // Native split has no per-turn boundaries.
    expect(result.metadata.perTurn).toBeUndefined();
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
    expect(result.metadata.perTurn).toBeDefined();
    expect(result.metadata.perTurn).toHaveLength(2);
    const sumChars = (result.metadata.perTurn ?? []).reduce(
      (n, m) => n + m.inputChars,
      0
    );
    expect(sumChars).toBe(result.metadata.inputChars);
    for (const m of result.metadata.perTurn ?? []) {
      expect(typeof m.latencyMs).toBe("number");
      expect(m.latencyMs).toBeGreaterThanOrEqual(0);
    }
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
    });

    const calls = (provider.generate as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    // stitchProvider's response_format: "pcm" is merged last and wins over caller keys.
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

  it("falls back to stitch with a warning when any per-turn providerOptions is set on a native-capable model", async () => {
    const pcm = new Int16Array(2400);
    const bytes = new Uint8Array(pcm.buffer);
    const provider: SpeechProvider = {
      id: "native-stitchable",
      defaultModel: "m",
      models: [],
      generate: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({ maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello.", providerOptions: { style: "casual" } },
      ],
      gapMs: 0,
    });

    expect(provider.generateDialogue).not.toHaveBeenCalled();
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(result.warnings?.[0]).toMatch(NATIVE_FALLBACK_WARNING_RE);
    expect(result.warnings?.[0]).toMatch(NATIVE_FALLBACK_CALL_COUNT_RE);
  });

  it("propagates StitchUnsupportedError when per-turn options force the stitch fallback on a native-only provider", async () => {
    const provider = nativeProvider();
    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hello.", providerOptions: { style: "casual" } },
        ],
      })
    ).rejects.toThrow(STITCH_UNSUPPORTED_RE);
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

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.speechbase.ai/v1/audio/conversation");
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty("mode");
    // Shared shape — every turn resolves to the same model, so the wire carries
    // a top-level `model` and turns omit it.
    expect(body.model).toBe("openai/gpt-4o-mini-tts");
    expect(body.turns).toEqual([
      { voice: "alloy", text: "Hi there." },
      { voice: "nova", text: "Hello!" },
    ]);
    expect(body.timestamps).toBeUndefined();

    expect(result.audio.uint8Array).toEqual(new Uint8Array([88, 89, 90]));
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.providerMetadata).toBeUndefined();
    expect(result.warnings).toBeUndefined();
  });

  it("does not validate ignored gateway maxInputChars values", async () => {
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

    await generateConversation({
      model: gateway("openai/gpt-4o-mini-tts"),
      turns: [{ voice: "alloy", text: "Hi there." }],
      maxInputChars: Number.NaN,
    });

    expect(fetchFn).toHaveBeenCalledTimes(1);
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
      await generateConversation({
        model: "openai/gpt-4o-mini-tts",
        apiKey: "gw-key",
        turns: [
          { voice: "alloy", text: "Hi there." },
          { voice: "nova", text: "Hello!" },
        ],
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe("https://api.speechbase.ai/v1/audio/conversation");
      const body = JSON.parse(init.body);
      expect(body.model).toBe("openai/gpt-4o-mini-tts");
      expect(body.turns).toEqual([
        { voice: "alloy", text: "Hi there." },
        { voice: "nova", text: "Hello!" },
      ]);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it("routes timestamps:true to /with-timestamps and uses server-attributed words", async () => {
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
      "https://api.speechbase.ai/v1/audio/conversation/with-timestamps"
    );
    const body = JSON.parse(init.body);
    expect(body.timestamps).toBeUndefined();

    expect(result.timestamps).toEqual([
      { text: "Hi", start: 0, end: 0.1, turnIndex: 0 },
      { text: "there.", start: 0.1, end: 0.3, turnIndex: 0 },
      { text: "Hello!", start: 0.4, end: 0.6, turnIndex: 1 },
    ]);
  });

  it("does not retry on 501 Not Implemented in the native path", async () => {
    // 501 = gateway's "this capability will never work" signal; retrying wastes round-trips.
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
      dialogueCapabilities: () => ({ maxVoices: 10 }),
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
