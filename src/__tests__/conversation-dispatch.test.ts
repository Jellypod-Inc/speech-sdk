import { describe, expect, it, vi } from "vitest";
import { chooseConversationPath } from "../conversation/dispatch.js";
import {
  DialogueConstraintError,
  StitchUnsupportedError,
} from "../conversation/errors.js";
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
});
