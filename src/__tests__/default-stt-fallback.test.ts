import { describe, expect, it } from "vitest";
import { getDefaultSTTFallback } from "../default-stt-fallback.js";

describe("getDefaultSTTFallback", () => {
  it("returns a ResolvedSTTModel pointing at OpenAI whisper-1", async () => {
    const fallback = await getDefaultSTTFallback();
    expect(fallback.provider.id).toBe("openai");
    expect(fallback.modelId).toBe("whisper-1");
    expect(typeof fallback.provider.transcribe).toBe("function");
  });

  it("returns the same instance on subsequent calls (cached)", async () => {
    const a = await getDefaultSTTFallback();
    const b = await getDefaultSTTFallback();
    expect(a).toBe(b);
  });
});
