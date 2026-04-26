import { describe, expect, it } from "vitest";
import { resolveModel } from "../resolve-provider.js";

describe("resolveModel", () => {
  it("routes provider/model string to the speech gateway", () => {
    const result = resolveModel("openai/tts-1");
    expect(result.provider.id).toBe("speech-gateway");
    expect(result.modelId).toBe("openai/tts-1");
  });

  it("routes bare provider strings to the gateway with the raw spec as modelId", () => {
    const result = resolveModel("openai");
    expect(result.provider.id).toBe("speech-gateway");
    expect(result.modelId).toBe("openai");
  });

  it("routes elevenlabs model strings to the gateway", () => {
    const result = resolveModel("elevenlabs/eleven_flash_v2_5");
    expect(result.provider.id).toBe("speech-gateway");
    expect(result.modelId).toBe("elevenlabs/eleven_flash_v2_5");
  });

  it("passes through ResolvedModel objects unchanged", () => {
    const mockProvider = {
      id: "test",
      defaultModel: "test-model",
      models: [],
      generate: async () => ({
        audio: new Uint8Array(),
        mediaType: "audio/mpeg",
      }),
    };
    const resolved = { provider: mockProvider, modelId: "custom-model" };
    const result = resolveModel(resolved);
    expect(result).toBe(resolved);
  });

  it("forwards apiKey to the gateway provider", () => {
    const result = resolveModel("openai/tts-1", { apiKey: "gw-key-123" });
    expect(result.provider.id).toBe("speech-gateway");
    expect(result.modelId).toBe("openai/tts-1");
  });

  it("ignores apiKey when model is a ResolvedModel", () => {
    const mockProvider = {
      id: "test",
      defaultModel: "test-model",
      models: [],
      generate: async () => ({
        audio: new Uint8Array(),
        mediaType: "audio/mpeg",
      }),
    };
    const resolved = { provider: mockProvider, modelId: "custom-model" };
    const result = resolveModel(resolved, { apiKey: "ignored-key" });
    expect(result).toBe(resolved);
  });
});
