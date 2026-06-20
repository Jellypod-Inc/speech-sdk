import { describe, expect, it, vi } from "vitest";
import { designVoice } from "../design-voice.js";
import {
  InvalidDesignFieldError,
  VoiceDesignUnsupportedError,
} from "../errors.js";
import type {
  DesignVoiceProviderRequest,
  DesignVoiceProviderResult,
  SpeechProvider,
} from "../speech-provider.js";

function fakeProvider(overrides: Partial<SpeechProvider> = {}): SpeechProvider {
  return {
    id: "fake",
    defaultModel: "m",
    models: [],
    generate: vi.fn(),
    ...overrides,
  } as SpeechProvider;
}

function factory(provider: SpeechProvider) {
  return () => ({ provider, modelId: provider.defaultModel });
}

describe("designVoice", () => {
  it("throws VoiceDesignUnsupportedError when the provider can't design", async () => {
    await expect(
      designVoice({
        provider: factory(fakeProvider()),
        name: "Voice",
        description: "warm narrator",
      })
    ).rejects.toBeInstanceOf(VoiceDesignUnsupportedError);
  });

  it("throws InvalidDesignFieldError on empty description", async () => {
    const provider = fakeProvider({ designVoice: vi.fn() });
    await expect(
      designVoice({
        provider: factory(provider),
        name: "Voice",
        description: "   ",
      })
    ).rejects.toBeInstanceOf(InvalidDesignFieldError);
  });

  it("throws InvalidDesignFieldError on empty name", async () => {
    const provider = fakeProvider({ designVoice: vi.fn() });
    await expect(
      designVoice({
        provider: factory(provider),
        name: "",
        description: "warm narrator",
      })
    ).rejects.toBeInstanceOf(InvalidDesignFieldError);
  });

  it("forwards fields to the provider and assembles the result", async () => {
    const preview = { audio: new Uint8Array([1, 2]), mediaType: "audio/wav" };
    const designVoiceFn = vi
      .fn<
        (req: DesignVoiceProviderRequest) => Promise<DesignVoiceProviderResult>
      >()
      .mockResolvedValue({
        voiceId: "vd_1",
        preview,
        warnings: ["heads up"],
        providerMetadata: { extra: true },
      });
    const provider = fakeProvider({ designVoice: designVoiceFn });

    const result = await designVoice({
      provider: factory(provider),
      name: "Narrator",
      description: "warm narrator",
      previewText: "hello there",
      language: "en",
      providerOptions: { guidance_scale: 5 },
    });

    expect(designVoiceFn).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Narrator",
        description: "warm narrator",
        previewText: "hello there",
        language: "en",
        providerOptions: { guidance_scale: 5 },
      })
    );
    expect(result).toEqual({
      voiceId: "vd_1",
      provider: "fake",
      preview,
      warnings: ["heads up"],
      providerMetadata: { extra: true },
    });
  });

  it("omits preview and warnings when the provider returns none", async () => {
    const provider = fakeProvider({
      designVoice: vi.fn().mockResolvedValue({ voiceId: "vd_2" }),
    });

    const result = await designVoice({
      provider: factory(provider),
      name: "Narrator",
      description: "warm narrator",
    });

    expect(result).toEqual({ voiceId: "vd_2", provider: "fake" });
  });
});
