import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveModel } from "../resolve-provider.js";

const UNKNOWN_PROVIDER_RE = /Unknown provider/;
const NO_DEFAULT_MODEL_RE = /no default model/;

describe("resolveModel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("routes a provider/model string straight to that provider", () => {
    const result = resolveModel("openai/tts-1");
    expect(result.provider.id).toBe("openai");
    expect(result.modelId).toBe("tts-1");
  });

  it("uses the provider default model for a bare provider string", () => {
    const result = resolveModel("openai");
    expect(result.provider.id).toBe("openai");
    expect(result.modelId).toBe("gpt-4o-mini-tts");
  });

  it("routes elevenlabs model strings to the elevenlabs provider", () => {
    const result = resolveModel("elevenlabs/eleven_flash_v2_5");
    expect(result.provider.id).toBe("elevenlabs");
    expect(result.modelId).toBe("eleven_flash_v2_5");
  });

  it("throws for an unknown provider prefix", () => {
    expect(() => resolveModel("nope/some-model")).toThrow(UNKNOWN_PROVIDER_RE);
  });

  it("throws for a provider with no default model when none is given", () => {
    expect(() => resolveModel("fal-ai")).toThrow(NO_DEFAULT_MODEL_RE);
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

  it("forwards apiKey to the resolved provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "audio/mpeg" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = resolveModel("openai/tts-1", { apiKey: "sk-explicit" });
    await result.provider.generate({
      modelId: result.modelId,
      text: "hello",
      voice: "alloy",
    });

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sk-explicit"
    );
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
