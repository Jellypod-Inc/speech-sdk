import { describe, expect, it, vi } from "vitest";
import { wrapPcm16Mono } from "../audio-utils.js";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { SpeechToTextProvider } from "../speech-to-text-provider.js";
import type { TimestampProvider } from "../timestamp-provider.js";
import type { WordTimestamp } from "../timestamps.js";

const SAMPLE_RATE = 24_000;

function silentWav(durationSeconds: number): Promise<Uint8Array> {
  const pcm = new Int16Array(Math.round(durationSeconds * SAMPLE_RATE));
  return wrapPcm16Mono(new Uint8Array(pcm.buffer), SAMPLE_RATE);
}

function wavProvider(options: {
  audio: Uint8Array;
  maxInputChars?: number;
  native?: boolean;
  timestamps?: WordTimestamp[];
}): SpeechProvider {
  return {
    id: "wav-tts",
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2026-01-01",
        languages: ["en"],
        features: options.native ? ["timestamps"] : [],
        ...(options.maxInputChars != null && {
          maxInputChars: options.maxInputChars,
        }),
      },
    ],
    generate: vi
      .fn()
      .mockImplementation((opts: { includeTimestamps?: boolean }) =>
        Promise.resolve({
          audio: options.audio,
          mediaType: "audio/wav",
          ...(opts.includeTimestamps && options.timestamps
            ? { timestamps: options.timestamps }
            : {}),
        })
      ),
    getStitchOptions: () => ({
      providerOptions: {},
      mediaType: "audio/wav",
    }),
  };
}

function alignerMock(
  timestamps: readonly WordTimestamp[] | ((text: string) => WordTimestamp[])
): TimestampProvider & { align: ReturnType<typeof vi.fn> } {
  const align = vi
    .fn()
    .mockImplementation(({ text }: { text: string }) =>
      Promise.resolve(
        typeof timestamps === "function" ? timestamps(text) : timestamps
      )
    );
  return { align };
}

function sttMock(
  words: WordTimestamp[]
): SpeechToTextProvider & { transcribe: ReturnType<typeof vi.fn> } {
  const transcribe = vi.fn().mockResolvedValue({ timestamps: words });
  return {
    id: "mock-stt",
    defaultModel: "m",
    models: [{ id: "m", releaseDate: "2026-01-01", languages: ["en"] }],
    transcribe,
  };
}

describe("timestamps never fail synthesis", () => {
  it("skips alignment for a one-word input and estimates a single span", async () => {
    const provider = wavProvider({ audio: await silentWav(1) });
    const aligner = alignerMock([]);

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "Yes.",
      voice: "v",
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(aligner.align).not.toHaveBeenCalled();
    expect(result.timestamps).toHaveLength(1);
    expect(result.timestamps[0]?.text).toBe("Yes.");
    expect(result.timestamps[0]?.start).toBe(0);
    expect(result.timestamps[0]?.end).toBeCloseTo(1, 3);
    expect(result.metadata.timestampsSource).toBe("estimated");
    expect(result.warnings).toBeUndefined();
  });

  it("estimates a tiny input when native timestamps come back empty, without calling the STT fallback", async () => {
    const provider = wavProvider({
      audio: await silentWav(1),
      native: true,
      timestamps: [],
    });
    const stt = sttMock([{ text: "Yes", start: 0, end: 0.4 }]);

    const result = await generateSpeech({
      model: {
        provider,
        modelId: "m",
        fallbackSTT: { provider: stt, modelId: "m" },
      },
      text: "Yes.",
      voice: "v",
      timestamps: true,
    });

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect(result.timestamps).toEqual([
      { text: "Yes.", start: 0, end: expect.closeTo(1, 3) },
    ]);
    expect(result.metadata.timestampsSource).toBe("estimated");
  });

  it("falls back to estimated timestamps when forced alignment mismatches the transcript", async () => {
    const provider = wavProvider({ audio: await silentWav(1) });
    const aligner = alignerMock([
      { text: "completely", start: 0, end: 0.3 },
      { text: "different", start: 0.3, end: 0.6 },
    ]);

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "alpha beta gamma delta",
      voice: "v",
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(aligner.align).toHaveBeenCalledOnce();
    expect(result.timestamps.map(({ text }) => text)).toEqual([
      "alpha",
      "beta",
      "gamma",
      "delta",
    ]);
    expect(result.timestamps[1]?.start).toBeCloseTo(0.25, 3);
    expect(result.timestamps[3]?.end).toBeCloseTo(1, 3);
    expect(result.metadata.timestampsSource).toBe("estimated");
    expect(result.warnings).toBeUndefined();
  });

  it("falls back to estimated timestamps when the alignment provider errors", async () => {
    const provider = wavProvider({ audio: await silentWav(1) });
    const align = vi.fn().mockRejectedValue(new Error("alignment outage"));

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "alpha beta gamma delta",
      voice: "v",
      timestamps: true,
      timestampProvider: { align },
    });

    expect(align).toHaveBeenCalledOnce();
    expect(result.timestamps).toHaveLength(4);
    expect(result.metadata.timestampsSource).toBe("estimated");
    expect(result.warnings).toBeUndefined();
  });

  it("aligns each synthesis chunk separately and concatenates with stitch offsets", async () => {
    const chunkAudio = await silentWav(0.5);
    const provider = wavProvider({ audio: chunkAudio, maxInputChars: 30 });
    const aligner = alignerMock((text) =>
      text.split(" ").map((word, index) => ({
        text: word,
        start: index * 0.05,
        end: index * 0.05 + 0.04,
      }))
    );

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "One two three four five. Six seven eight nine ten.",
      voice: "v",
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(aligner.align).toHaveBeenCalledTimes(2);
    const alignCalls = aligner.align.mock.calls.map(
      ([input]) =>
        input as { audio: Uint8Array; mediaType: string; text: string }
    );
    expect(alignCalls.map(({ text }) => text)).toEqual([
      "One two three four five.",
      "Six seven eight nine ten.",
    ]);
    expect(alignCalls.every(({ mediaType }) => mediaType === "audio/wav")).toBe(
      true
    );
    // Each aligner call sees only its own chunk's audio (~0.5s of 24kHz pcm), not the stitched result.
    for (const { audio } of alignCalls) {
      expect(audio.byteLength).toBeLessThan(SAMPLE_RATE * 2 * 0.5 + 1024);
    }

    expect(result.timestamps.map(({ text }) => text)).toEqual([
      "One",
      "two",
      "three",
      "four",
      "five.",
      "Six",
      "seven",
      "eight",
      "nine",
      "ten.",
    ]);
    // Second chunk's words are offset by the first chunk's duration.
    expect(result.timestamps[5]?.start).toBeCloseTo(0.5, 3);
    expect(result.timestamps[9]?.end).toBeCloseTo(0.5 + 4 * 0.05 + 0.04, 3);
    expect(result.metadata.timestampsSource).toBe("aligned");
  });

  it("estimates over the full stitched duration when chunked alignment fails", async () => {
    const chunkAudio = await silentWav(0.5);
    const provider = wavProvider({ audio: chunkAudio, maxInputChars: 30 });
    const align = vi.fn().mockResolvedValue([]);

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "One two three four five. Six seven eight nine ten.",
      voice: "v",
      timestamps: true,
      timestampProvider: { align },
    });

    expect(result.timestamps).toHaveLength(10);
    expect(result.timestamps[0]?.start).toBe(0);
    expect(result.timestamps[9]?.end).toBeCloseTo(1, 2);
    expect(result.metadata.timestampsSource).toBe("estimated");
  });

  it("reports the native source when provider timestamps validate", async () => {
    const provider = wavProvider({
      audio: await silentWav(1),
      native: true,
      timestamps: [{ text: "Hi", start: 0, end: 0.3 }],
    });

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "Hi",
      voice: "v",
      timestamps: true,
    });

    expect(result.timestamps).toEqual([{ text: "Hi", start: 0, end: 0.3 }]);
    expect(result.metadata.timestampsSource).toBe("native");
    expect(result.warnings).toBeUndefined();
  });

  it("reports the aligned source when a timestamp provider supplies timings", async () => {
    const provider = wavProvider({ audio: await silentWav(1) });
    const aligner = alignerMock([
      { text: "alpha", start: 0, end: 0.3 },
      { text: "beta", start: 0.3, end: 0.6 },
      { text: "gamma", start: 0.6, end: 0.9 },
    ]);

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "alpha beta gamma",
      voice: "v",
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(aligner.align).toHaveBeenCalledOnce();
    expect(result.metadata.timestampsSource).toBe("aligned");
    expect(result.warnings).toBeUndefined();
  });

  it("leaves timestampsSource unset when timestamps are off", async () => {
    const provider = wavProvider({ audio: await silentWav(1) });

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      text: "Hi",
      voice: "v",
    });

    expect(result.metadata.timestampsSource).toBeUndefined();
    expect(result.timestamps).toBeUndefined();
  });
});
