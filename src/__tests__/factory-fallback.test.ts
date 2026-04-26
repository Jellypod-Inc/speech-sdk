import { describe, expect, it } from "vitest";
import { createOpenAI } from "../providers/openai/index.js";

describe("provider factory fallbackSTT", () => {
  it("createOpenAI stamps fallbackSTT onto the returned ResolvedModel", () => {
    const sttFactory = createOpenAI({ apiKey: "stt-key" });
    const sttResolved = sttFactory.stt();
    const openai = createOpenAI({
      apiKey: "tts-key",
      fallbackSTT: {
        provider: sttResolved.provider,
        modelId: sttResolved.modelId,
      },
    });
    const resolved = openai("tts-1");
    expect(resolved.fallbackSTT).toBeDefined();
    expect(resolved.fallbackSTT?.provider.id).toBe("openai");
    expect(resolved.fallbackSTT?.modelId).toBe(sttResolved.modelId);
  });

  it("createOpenAI without fallbackSTT leaves resolved.fallbackSTT undefined", () => {
    const openai = createOpenAI({ apiKey: "tts-key" });
    expect(openai("tts-1").fallbackSTT).toBeUndefined();
  });
});
