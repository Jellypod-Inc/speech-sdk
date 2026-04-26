import { describe, expect, it } from "vitest";
import { createOpenAI } from "../providers/openai/index.js";

describe("createOpenAI factory shape", () => {
  it("the returned function is callable for TTS", () => {
    const openai = createOpenAI({ apiKey: "k" });
    const resolved = openai("tts-1");
    expect(resolved.modelId).toBe("tts-1");
    expect(resolved.provider.id).toBe("openai");
  });

  it("exposes .stt() that returns a ResolvedSTTModel", () => {
    const openai = createOpenAI({ apiKey: "k" });
    const stt = openai.stt("whisper-1");
    expect(stt.modelId).toBe("whisper-1");
    expect(stt.provider.id).toBe("openai");
    expect(typeof stt.provider.transcribe).toBe("function");
  });

  it("openai() defaults to TTS defaultModel", () => {
    const openai = createOpenAI({ apiKey: "k" });
    expect(openai().modelId).toBe("gpt-4o-mini-tts");
  });

  it("openai.stt() defaults to STT defaultModel", () => {
    const openai = createOpenAI({ apiKey: "k" });
    expect(openai.stt().modelId).toBe("whisper-1");
  });

  it("STT and TTS providers share apiKey/baseURL/fetch from one config", async () => {
    const calls: string[] = [];
    const fakeFetch = ((url: string) => {
      calls.push(url);
      return Promise.resolve(new Response("err", { status: 500 }));
    }) as unknown as typeof fetch;
    const openai = createOpenAI({
      apiKey: "k",
      baseURL: "https://example.test/v1",
      fetch: fakeFetch,
    });

    // Best-effort transcribe; we just want the URL captured.
    const stt = openai.stt("whisper-1");
    await expect(
      stt.provider.transcribe({
        modelId: stt.modelId,
        audio: new Uint8Array([0, 0]),
        mediaType: "audio/wav",
      })
    ).rejects.toBeDefined();

    expect(calls[0]).toBe("https://example.test/v1/audio/transcriptions");
  });
});
