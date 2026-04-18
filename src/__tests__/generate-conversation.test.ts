import { describe, expect, it, vi } from "vitest";
import { generateConversation } from "../generate-conversation.js";
import type { SpeechProvider } from "../speech-provider.js";

const AT_LEAST_ONE_TURN_RE = /at least one turn/i;

function nativeProvider(): SpeechProvider {
  return {
    id: "native",
    defaultModel: "m",
    models: [],
    generate: vi.fn(),
    generateDialogue: vi.fn().mockResolvedValue({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: "audio/mpeg",
      audioDurationMs: 1000,
      providerMetadata: { requestId: "abc" },
    }),
    dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
  };
}

function stitchProvider(): SpeechProvider {
  const pcm = new Int16Array(2400);
  const bytes = new Uint8Array(pcm.buffer);
  return {
    id: "stitch",
    defaultModel: "m",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: bytes,
      mediaType: "audio/pcm;rate=24000",
    }),
    getStitchOptions: () => ({
      providerOptions: { response_format: "pcm" },
      mediaType: "audio/pcm;rate=24000",
    }),
  };
}

describe("generateConversation", () => {
  it("routes to native path when provider supports dialogue and constraints hold", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
    });
    expect(provider.generateDialogue).toHaveBeenCalledTimes(1);
    expect(result.audio.uint8Array).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.metadata.provider).toBe("native");
    expect(result.metadata.model).toBe("m");
    expect(result.metadata.inputChars).toBe("Hi.".length + "Hello.".length);
  });

  it("routes to stitch path when dialogue unsupported", async () => {
    const provider = stitchProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi." },
        { voice: "b", text: "Hello." },
      ],
      gapMs: 0,
    });
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(result.audio.mediaType).toBe("audio/wav");
  });

  it("rejects invalid inputs before any provider call", async () => {
    const provider = stitchProvider();
    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [],
      })
    ).rejects.toThrow(AT_LEAST_ONE_TURN_RE);
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
