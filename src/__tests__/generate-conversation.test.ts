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
    // Native provider with no getStitchOptions ⇒ normalization can't run, so
    // a warning surfaces (but the audio passes through untouched).
    expect(result.warnings?.length ?? 0).toBeGreaterThan(0);
  });

  it("normalizes the native dialogue output when the provider exposes a stitch mode", async () => {
    const pcm = new Int16Array(2400);
    pcm.fill(8000);
    const bytes = new Uint8Array(pcm.buffer);
    const provider: SpeechProvider = {
      id: "native-stitchable",
      defaultModel: "m",
      models: [],
      generate: vi.fn(),
      generateDialogue: vi.fn().mockResolvedValue({
        audio: bytes,
        mediaType: "audio/pcm;rate=24000",
      }),
      dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
      getStitchOptions: () => ({
        providerOptions: { response_format: "pcm" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "Hello" },
      ],
    });

    // generateDialogue must have received the stitch-mode providerOptions
    // so the model returns decodable PCM.
    const dialogueCallArgs = (
      provider.generateDialogue as ReturnType<typeof vi.fn>
    ).mock.calls[0][0];
    expect(dialogueCallArgs.providerOptions).toEqual({
      response_format: "pcm",
    });

    // Output is the re-encoded WAV at the default -20 dBFS RMS target.
    expect(result.audio.mediaType).toBe("audio/wav");
    const wav = result.audio.uint8Array;
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(0)).toBe(0x52_49_46_46);
    expect(result.warnings).toBeUndefined();
  });

  it("skips native-path normalization when normalizeVolume:false", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hi" },
        { voice: "b", text: "Hello" },
      ],
      normalizeVolume: false,
    });
    // No warning when the user explicitly opted out.
    expect(result.warnings).toBeUndefined();
    expect(result.audio.mediaType).toBe("audio/mpeg");
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
