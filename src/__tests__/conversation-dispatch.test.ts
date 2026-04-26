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
    // The wire is per-turn `{model, voice, text}`, so the server handles
    // mixed-provider conversations in one call. No more allSame gate.
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
    // Allow-by-default: every gateway-routed model should take the gateway
    // branch regardless of whether the upstream provider supports native
    // multi-speaker — the server handles per-turn rendering. This test uses
    // cartesia/sonic-3 (a model that was NOT in the old 3-entry capability
    // table) to prove there's no SDK-side allowlist left.
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

  it("falls through past gateway when any turn uses an object-shaped voice (clone ref)", () => {
    const gateway = createSpeechGateway({ apiKey: "k" });
    // Gateway conversation wire contract accepts string voices only on the
    // flat turn shape; voice clones (`{url}` / `{audio}`) go through stitch.
    // StitchUnsupportedError confirms dispatch left the gateway branch.
    const resolved = gateway("openai/gpt-4o-mini-tts");
    expect(() =>
      chooseConversationPath({
        resolvedPerTurn: [resolved, resolved],
        turns: [
          { voice: "alloy", text: "Hi." },
          { voice: { url: "https://example.com/clone.wav" }, text: "Hello." },
        ],
      })
    ).toThrow(StitchUnsupportedError);
  });
});
