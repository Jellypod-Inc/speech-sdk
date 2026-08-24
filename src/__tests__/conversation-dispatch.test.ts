import { describe, expect, it, vi } from "vitest";
import { chooseConversationPath } from "../conversation/dispatch.js";
import { StitchUnsupportedError } from "../conversation/errors.js";
import type { SpeechProvider } from "../speech-provider.js";

function mockProvider(overrides: Partial<SpeechProvider> = {}): SpeechProvider {
  return {
    id: "mock",
    defaultModel: "m",
    models: [],
    generate: vi.fn(),
    ...overrides,
  };
}

describe("chooseConversationPath", () => {
  it("returns native when all turns share one model with dialogue and constraints met", () => {
    const provider = mockProvider({
      id: "elevenlabs",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({
        maxVoices: 10,
        maxTotalChars: 2000,
      }),
    });
    const resolved = [
      { provider, modelId: "eleven_v3" },
      { provider, modelId: "eleven_v3" },
    ];
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("native");
  });

  it("falls back to stitch with reason when any per-turn providerOptions is set on a native-capable model", () => {
    const provider = mockProvider({
      id: "elevenlabs",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({ maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { output_format: "pcm_24000" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const resolved = [
      { provider, modelId: "eleven_v3" },
      { provider, modelId: "eleven_v3" },
    ];
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello.", providerOptions: { x: 1 } },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBe("fallback-from-native");
    }
  });

  it("skips native voice-count and maxTotalChars checks when per-turn options force the stitch fallback", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({
        maxVoices: 2,
        maxTotalChars: 5,
      }),
      getStitchOptions: () => ({
        providerOptions: { audio_config: { sample_rate_hertz: 24_000 } },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    // 3 unique voices + 21 chars both violate native caps; with per-turn options the request should still dispatch to stitch instead of throwing DialogueConstraintError.
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hello there.", providerOptions: { x: 1 } },
        { voice: "b", text: "General." },
        { voice: "c", text: "Kenobi." },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBe("fallback-from-native");
    }
  });

  it("uses stitch with no fallback reason when provider has no native dialogue capability", () => {
    const provider = mockProvider({
      id: "openai",
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const result = chooseConversationPath({
      resolvedPerTurn: [
        { provider, modelId: "tts-1" },
        { provider, modelId: "tts-1" },
      ],
      turns: [
        { voice: "nova", text: "Hi.", providerOptions: { speed: 0.9 } },
        { voice: "shimmer", text: "Hello.", providerOptions: { speed: 1.1 } },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBeUndefined();
    }
  });

  it("returns stitch when provider lacks generateDialogue", () => {
    const provider = mockProvider({
      id: "openai",
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const resolved = [
      { provider, modelId: "tts-1" },
      { provider, modelId: "tts-1" },
    ];
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "nova", text: "Hi." },
        { voice: "shimmer", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("stitch");
  });

  it("returns stitch for mixed models", () => {
    const a = mockProvider({
      id: "openai",
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const b = mockProvider({
      id: "elevenlabs",
      getStitchOptions: () => ({
        providerOptions: { output_format: "pcm_24000" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const result = chooseConversationPath({
      resolvedPerTurn: [
        { provider: a, modelId: "tts-1" },
        { provider: b, modelId: "eleven_v3" },
      ],
      turns: [
        { voice: "nova", text: "Hi." },
        { voice: "v2", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("stitch");
  });

  it("falls back to stitch when more unique voices than the provider's native dialogue supports", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({ maxVoices: 2 }),
      getStitchOptions: () => ({ providerOptions: {}, mediaType: "audio/wav" }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hey." },
        { voice: "c", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBe("fallback-from-native-voice-count-exceeded");
    }
  });

  it("routes a single-voice conversation to stitch on a max-2-voice native provider", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({ maxVoices: 2 }),
      getStitchOptions: () => ({ providerOptions: {}, mediaType: "audio/wav" }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    // Both turns resolve to one voice — a monologue with no valid native-dialogue call to make.
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "a", text: "Hello again." },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBe("fallback-from-native-voice-count");
    }
  });

  it("routes a single-voice conversation to stitch even on a native provider that allows one voice", () => {
    const provider = mockProvider({
      id: "elevenlabs",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({ maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { output_format: "pcm_24000" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    const resolved = [
      { provider, modelId: "eleven_v3" },
      { provider, modelId: "eleven_v3" },
    ];
    // A single speaker is sequential speech — never the native multi-speaker path, even
    // though this provider could carry one voice natively.
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "a", text: "Hello again." },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBe("fallback-from-native-voice-count");
    }
  });

  it("splits an over-limit native dialogue into parallel voice-valid blocks", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({
        maxVoices: 2,
        maxTotalChars: 12,
      }),
      getStitchOptions: () => ({
        providerOptions: {},
        mediaType: "audio/wav",
      }),
    });
    const resolved = Array.from({ length: 6 }, () => ({
      provider,
      modelId: "gemini-3.1-flash-tts-preview",
    }));
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "Yo" },
        { voice: "a", text: "Hello" },
        { voice: "b", text: "World" },
        { voice: "a", text: "Foo" },
        { voice: "b", text: "Bar" },
      ],
    });
    expect(result.kind).toBe("native");
    if (result.kind === "native") {
      expect(result.blocks).toEqual([
        [0, 1, 2],
        [3, 4, 5],
      ]);
    }
  });

  it("returns native without blocks when the dialogue fits the native limit", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({
        maxVoices: 2,
        maxTotalChars: 5000,
      }),
      getStitchOptions: () => ({ providerOptions: {}, mediaType: "audio/wav" }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("native");
    if (result.kind === "native") {
      expect(result.blocks).toBeUndefined();
    }
  });

  it("falls back to stitch when a single turn exceeds the native limit", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({
        maxVoices: 2,
        maxTotalChars: 5,
      }),
      getStitchOptions: () => ({ providerOptions: {}, mediaType: "audio/wav" }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "HelloWorld" },
        { voice: "b", text: "Hi" },
      ],
    });
    expect(result.kind).toBe("stitch");
    if (result.kind === "stitch") {
      expect(result.reason).toBe("fallback-from-native-oversized");
    }
  });

  it("falls back to stitch when a block can't satisfy the unique-voice rule", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({
        maxVoices: 2,
        maxTotalChars: 8,
      }),
      getStitchOptions: () => ({ providerOptions: {}, mediaType: "audio/wav" }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    // A long single-speaker run fills a block, stranding it at 1 unique voice on a 2-voice model.
    const result = chooseConversationPath({
      resolvedPerTurn: resolved,
      turns: [
        { voice: "a", text: "AAAA" },
        { voice: "a", text: "BBBB" },
        { voice: "b", text: "CC" },
      ],
    });
    expect(result.kind).toBe("stitch");
  });

  it("throws StitchUnsupportedError when stitch path hits a provider without getStitchOptions", () => {
    const provider = mockProvider({ id: "openai" });
    expect(() =>
      chooseConversationPath({
        resolvedPerTurn: [
          { provider, modelId: "tts-1" },
          { provider, modelId: "tts-1" },
        ],
        turns: [
          { voice: "nova", text: "Hi." },
          { voice: "shimmer", text: "Hello." },
        ],
      })
    ).toThrow(StitchUnsupportedError);
  });
});
