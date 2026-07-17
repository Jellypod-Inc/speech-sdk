import { describe, expect, it, vi } from "vitest";
import { InstructionsUnsupportedError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { TimestampProvider } from "../timestamp-provider.js";

const modelInfo = (features: readonly string[] = []) => ({
  id: "model",
  features,
  languages: ["en"],
  releaseDate: "2026-01-01",
});

const timestampProvider = (
  timestamps: readonly { text: string; start: number; end: number }[]
): TimestampProvider & { align: ReturnType<typeof vi.fn> } => {
  const align = vi.fn().mockResolvedValue(timestamps);
  return { align };
};

describe("spoken text and delivery instructions", () => {
  it("leaves text-only third-party provider calls unchanged", async () => {
    const generate = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
    });
    const provider: SpeechProvider = {
      id: "third-party",
      defaultModel: "model",
      models: [modelInfo()],
      generate,
    };

    await generateSpeech({
      model: { provider, modelId: "model" },
      voice: "voice",
      text: "Exact spoken text.",
    });

    expect(generate.mock.calls[0][0]).not.toHaveProperty("instructions");
    expect(generate.mock.calls[0][0].text).toBe("Exact spoken text.");
  });

  it("sends instructions only to a supporting TTS provider", async () => {
    const generate = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
    });
    const provider: SpeechProvider = {
      id: "supporting",
      defaultModel: "model",
      models: [modelInfo(["instructions"])],
      generate,
    };
    const aligner = timestampProvider([
      { text: "Exact", start: 0, end: 0.1 },
      { text: "spoken", start: 0.1, end: 0.2 },
      { text: "text", start: 0.2, end: 0.3 },
    ]);

    const result = await generateSpeech({
      model: { provider, modelId: "model" },
      voice: "voice",
      text: "Exact spoken text.",
      instructions: "Warm and measured.",
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "Exact spoken text.",
        instructions: "Warm and measured.",
      })
    );
    expect(aligner.align).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Exact spoken text." })
    );
    expect(result.timestamps.map(({ text }) => text)).toEqual([
      "Exact",
      "spoken",
      "text.",
    ]);
  });

  it("still rejects altered canonical spoken words", async () => {
    const provider: SpeechProvider = {
      id: "supporting",
      defaultModel: "model",
      models: [modelInfo(["instructions"])],
      generate: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1]),
        mediaType: "audio/mpeg",
      }),
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "model" },
        voice: "voice",
        text: "Exact spoken text.",
        instructions: "Warm and measured.",
        timestamps: true,
        timestampProvider: timestampProvider([
          { text: "Exact", start: 0, end: 0.1 },
          { text: "changed", start: 0.1, end: 0.2 },
          { text: "text", start: 0.2, end: 0.3 },
        ]),
      })
    ).rejects.toMatchObject({ reason: "transcript_mismatch" });
  });

  it("rejects unsupported instructions before synthesis", async () => {
    const generate = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
    });
    const provider: SpeechProvider = {
      id: "unsupported",
      defaultModel: "model",
      models: [modelInfo()],
      generate,
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: "model" },
        voice: "voice",
        text: "Hello.",
        instructions: "Whisper.",
      })
    ).rejects.toBeInstanceOf(InstructionsUnsupportedError);
    expect(generate).not.toHaveBeenCalled();

    await generateSpeech({
      model: { provider, modelId: "model" },
      voice: "voice",
      text: "Hello.",
      instructions: "   ",
    });
    expect(generate.mock.calls[0][0]).not.toHaveProperty("instructions");
  });

  it("excludes supported non-spoken cues from exact alignment", async () => {
    const generate = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
      timestamps: [{ text: "Hello", start: 0, end: 0.2 }],
    });
    const provider: SpeechProvider = {
      id: "cue-provider",
      defaultModel: "model",
      models: [modelInfo(["audio-tags", "timestamps"])],
      processAudioTags: (text) => ({ text, warnings: [] }),
      generate,
    };

    const result = await generateSpeech({
      model: { provider, modelId: "model" },
      voice: "voice",
      text: "[laugh] Hello",
      timestamps: true,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ text: "[laugh] Hello" })
    );
    expect(result.timestamps).toEqual([{ text: "Hello", start: 0, end: 0.2 }]);
  });

  it("applies the same contract to stitched conversation turns", async () => {
    const pcm = new Uint8Array(new Int16Array(2400).buffer);
    const generate = vi.fn().mockResolvedValue({
      audio: pcm,
      mediaType: "audio/pcm;rate=24000",
    });
    const provider: SpeechProvider = {
      id: "conversation-provider",
      defaultModel: "model",
      models: [modelInfo(["instructions"])],
      generate,
      getStitchOptions: () => ({
        providerOptions: {},
        mediaType: "audio/pcm;rate=24000",
      }),
    };
    const align = vi
      .fn()
      .mockImplementation(({ text }: { text: string }) =>
        Promise.resolve([{ text, start: 0, end: 0.05 }])
      );

    const result = await generateConversation({
      model: { provider, modelId: "model" },
      instructions: "Natural dialogue.",
      turns: [
        { voice: "a", text: "Hello", instructions: "Bright." },
        { voice: "b", text: "Goodbye", instructions: "Soft." },
      ],
      timestamps: true,
      timestampProvider: { align },
    });

    expect(generate.mock.calls.map(([call]) => call.instructions)).toEqual([
      "Natural dialogue.\n\nBright.",
      "Natural dialogue.\n\nSoft.",
    ]);
    expect(align.mock.calls.map(([call]) => call.text)).toEqual([
      "Hello",
      "Goodbye",
    ]);
    expect(result.timestamps?.map(({ text }) => text)).toEqual([
      "Hello",
      "Goodbye",
    ]);
  });

  it("keeps native-dialogue instructions out of forced alignment", async () => {
    const generateDialogue = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      audioDurationMs: 1000,
      mediaType: "audio/mpeg",
    });
    const provider: SpeechProvider = {
      id: "native-conversation-provider",
      defaultModel: "model",
      models: [modelInfo(["instructions"])],
      generate: vi.fn(),
      generateDialogue,
      dialogueCapabilities: () => ({ maxVoices: 2 }),
    };
    const align = vi.fn().mockResolvedValue([
      { text: "Hello", start: 0, end: 0.2 },
      { text: "Goodbye", start: 0.3, end: 0.5 },
    ]);

    const result = await generateConversation({
      model: { provider, modelId: "model" },
      instructions: "Natural dialogue.",
      turns: [
        { voice: "a", text: "Hello", instructions: "Bright." },
        { voice: "b", text: "Goodbye", instructions: "Soft." },
      ],
      timestamps: true,
      timestampProvider: { align },
    });

    expect(generateDialogue).toHaveBeenCalledWith(
      expect.objectContaining({
        instructions: "Natural dialogue.",
        turns: [
          { voice: "a", text: "Hello", instructions: "Bright." },
          { voice: "b", text: "Goodbye", instructions: "Soft." },
        ],
      })
    );
    expect(align).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello Goodbye" })
    );
    expect(result.timestamps?.map(({ text }) => text)).toEqual([
      "Hello",
      "Goodbye",
    ]);
  });
});
