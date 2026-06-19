import { describe, expect, it, vi } from "vitest";
import { chooseConversationPath } from "../conversation/dispatch.js";
import {
  DialogueConstraintError,
  MixedDispatchError,
  StitchUnsupportedError,
} from "../conversation/errors.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
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
        minVoices: 1,
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
      dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
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
        minVoices: 2,
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

  it("throws DialogueConstraintError when native constraints are violated", () => {
    const provider = mockProvider({
      id: "google",
      generateDialogue: vi.fn(),
      dialogueCapabilities: () => ({ minVoices: 2, maxVoices: 2 }),
    });
    const resolved = [
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
      { provider, modelId: "gemini-3.1-flash-tts-preview" },
    ];
    expect(() =>
      chooseConversationPath({
        resolvedPerTurn: resolved,
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hey." },
          { voice: "c", text: "Hello." },
        ],
      })
    ).toThrow(DialogueConstraintError);
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

  it("returns gateway when all turns share one supported gateway model", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    const resolved = gateway("openai/gpt-4o-mini-tts");
    const result = chooseConversationPath({
      resolvedPerTurn: [resolved, resolved],
      turns: [
        { voice: "alloy", text: "Hi." },
        { voice: "nova", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("gateway");
    if (result.kind === "gateway") {
      expect(result.resolvedPerTurn.map((r) => r.modelId)).toEqual([
        "openai/gpt-4o-mini-tts",
        "openai/gpt-4o-mini-tts",
      ]);
    }
  });

  it("returns gateway when gateway models are heterogeneous", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    const resolvedA = gateway("openai/gpt-4o-mini-tts");
    const resolvedB = gateway("elevenlabs/eleven_v3");
    const result = chooseConversationPath({
      resolvedPerTurn: [resolvedA, resolvedB],
      turns: [
        { voice: "alloy", text: "Hi." },
        { voice: "rachel", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("gateway");
    if (result.kind === "gateway") {
      expect(result.resolvedPerTurn.map((r) => r.modelId)).toEqual([
        "openai/gpt-4o-mini-tts",
        "elevenlabs/eleven_v3",
      ]);
    }
  });

  it("returns gateway for arbitrary aggregated models (no per-model gate)", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    // cartesia/sonic-3 was not in the old 3-entry capability table; proves no SDK-side allowlist.
    const resolved = gateway("cartesia/sonic-3");
    const result = chooseConversationPath({
      resolvedPerTurn: [resolved, resolved],
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
    });
    expect(result.kind).toBe("gateway");
    if (result.kind === "gateway") {
      expect(result.resolvedPerTurn[0].modelId).toBe("cartesia/sonic-3");
    }
  });

  it("throws MixedDispatchError when one turn is gateway and another is direct", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    const gatewayResolved = gateway("openai/gpt-4o-mini-tts");
    const direct = mockProvider({
      id: "openai",
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    });
    expect(() =>
      chooseConversationPath({
        resolvedPerTurn: [
          gatewayResolved,
          { provider: direct, modelId: "tts-1" },
        ],
        turns: [
          { voice: "alloy", text: "Hi." },
          { voice: "nova", text: "Hello." },
        ],
      })
    ).toThrow(MixedDispatchError);
  });
});
