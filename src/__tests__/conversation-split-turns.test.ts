import { describe, expect, it, vi } from "vitest";
import { decodeAudioToPcm16 } from "../audio-decode.js";
import {
  ConversationInputError,
  TurnSplitError,
} from "../conversation/errors.js";
import {
  planTurnCuts,
  splitConversationTurns,
} from "../conversation/split-turns.js";
import { generateConversation } from "../generate-conversation.js";
import type { SpeechProvider } from "../speech-provider.js";
import type { ConversationTurnAudio } from "../speech-result.js";
import type { WordTimestamp } from "../timestamps.js";

const RATE = 24_000;
const PCM_MEDIA_TYPE = `audio/pcm;rate=${RATE}`;
const WORD_MS = 200;
const WHITESPACE = /\s+/;

function samples(ms: number): number {
  return Math.round((ms / 1000) * RATE);
}

function tone(ms: number, amplitude = 8000): Int16Array {
  const out = new Int16Array(samples(ms));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.round(amplitude * Math.sin((2 * Math.PI * 220 * i) / RATE));
  }
  return out;
}

function silence(ms: number): Int16Array {
  return new Int16Array(samples(ms));
}

function concat(...parts: Int16Array[]): Int16Array {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function bytesOf(pcm: Int16Array): Uint8Array {
  return new Uint8Array(pcm.slice().buffer);
}

interface Rendered {
  readonly pcm: Int16Array;
  readonly timestamps: WordTimestamp[];
}

// One 200 ms tone per word, words back to back, `betweenMs` of silence between turns.
function renderDialogue(
  turns: readonly { text: string }[],
  betweenMs = 300
): Rendered {
  const parts: Int16Array[] = [];
  const timestamps: WordTimestamp[] = [];
  let cursorMs = 0;
  for (const [index, turn] of turns.entries()) {
    if (index > 0) {
      parts.push(silence(betweenMs));
      cursorMs += betweenMs;
    }
    for (const word of turn.text.split(WHITESPACE)) {
      parts.push(tone(WORD_MS));
      timestamps.push({
        text: word,
        start: cursorMs / 1000,
        end: (cursorMs + WORD_MS) / 1000,
      });
      cursorMs += WORD_MS;
    }
  }
  return { pcm: concat(...parts), timestamps };
}

function nativeProvider(
  options: {
    maxTotalChars?: number;
    decodable?: boolean;
    render?: (turns: readonly { text: string }[]) => Rendered;
  } = {}
): SpeechProvider {
  const render = options.render ?? ((turns) => renderDialogue(turns));
  return {
    id: "native",
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: ["timestamps"],
      },
    ],
    generate: vi.fn((opts: { text: string; includeTimestamps?: boolean }) => {
      const { pcm, timestamps } = render([{ text: opts.text }]);
      return Promise.resolve({
        audio: bytesOf(pcm),
        mediaType: PCM_MEDIA_TYPE,
        ...(opts.includeTimestamps && { timestamps }),
      });
    }),
    generateDialogue: vi.fn(
      (opts: {
        turns: readonly { text: string }[];
        includeTimestamps?: boolean;
      }) => {
        const { pcm, timestamps } = render(opts.turns);
        return Promise.resolve({
          audio: bytesOf(pcm),
          mediaType: PCM_MEDIA_TYPE,
          ...(opts.includeTimestamps && { timestamps }),
        });
      }
    ),
    dialogueCapabilities: () => ({
      maxVoices: 2,
      ...(options.maxTotalChars != null && {
        maxTotalChars: options.maxTotalChars,
      }),
    }),
    ...(options.decodable !== false && {
      getStitchOptions: () => ({
        providerOptions: {},
        mediaType: PCM_MEDIA_TYPE,
      }),
    }),
  };
}

// Single-speaker provider whose clips carry leading and trailing silence around the words.
function stitchProvider(id: string): SpeechProvider {
  return {
    id,
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: ["timestamps"],
      },
    ],
    generate: vi.fn((opts: { text: string; includeTimestamps?: boolean }) => {
      const words = opts.text.split(WHITESPACE);
      const pcm = concat(
        silence(100),
        ...words.map(() => tone(WORD_MS)),
        silence(200)
      );
      return Promise.resolve({
        audio: bytesOf(pcm),
        mediaType: PCM_MEDIA_TYPE,
        ...(opts.includeTimestamps && {
          timestamps: words.map((text, i) => ({
            text,
            start: (100 + i * WORD_MS) / 1000,
            end: (100 + (i + 1) * WORD_MS) / 1000,
          })),
        }),
      });
    }),
    getStitchOptions: () => ({
      providerOptions: {},
      mediaType: PCM_MEDIA_TYPE,
    }),
  };
}

async function decodeTurn(turn: ConversationTurnAudio): Promise<Int16Array> {
  return (await decodeAudioToPcm16(turn.audio.uint8Array, turn.audio.mediaType))
    .pcm;
}

function rms(pcm: Int16Array): number {
  let sumSq = 0;
  for (const s of pcm) {
    sumSq += s * s;
  }
  return pcm.length === 0 ? 0 : Math.sqrt(sumSq / pcm.length);
}

const TWO_TURNS = [
  { voice: "a", text: "hello there" },
  { voice: "b", text: "hi back" },
] as const;

describe("generateConversation splitTurns", () => {
  it("splits a clean two-speaker native dialogue in the middle of the silence", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: TWO_TURNS,
      timestamps: true,
      splitTurns: true,
    });

    expect(result.metadata.path).toBe("native");
    expect(result.turns.map((t) => t.turnIndex)).toEqual([0, 1]);
    // Turn 0 words end at 400 ms, turn 1 starts at 700 ms: cut at 550 ms.
    expect(result.turns[0].startMs).toBe(0);
    expect(result.turns[0].endMs).toBeCloseTo(550, 6);
    expect(result.turns[1].startMs).toBeCloseTo(550, 6);
    expect(result.turns[1].timestamps.map((w) => w.text)).toEqual([
      "hi",
      "back",
    ]);
    expect(result.turns[1].timestamps[0].start).toBeCloseTo(0.15, 6);
    expect(result.turns[0].timestamps[0]).toEqual({
      text: "hello",
      start: 0,
      end: 0.2,
    });
    expect(result.turns[0].audio.mediaType).toBe("audio/wav");
  });

  it("keeps a breath opening the next turn with that turn", () => {
    // Turn 0 words 0–500 ms, silence, a quiet breath, a short silence, turn 1 words from 1000 ms.
    const pcm = concat(
      tone(500),
      silence(200),
      tone(200, 600),
      silence(100),
      tone(500)
    );
    const [cut] = planTurnCuts({
      pcm,
      sampleRate: RATE,
      spans: [
        { firstStart: 0, lastEnd: 0.5 },
        { firstStart: 1.0, lastEnd: 1.5 },
      ],
    });
    // Midpoint between words (750 ms) would cut through the breath; the first silence is 500–700 ms.
    expect(cut).toBe(samples(600));
    expect(rms(pcm.subarray(cut, samples(1000)))).toBeGreaterThan(100);
  });

  it("cuts at the quietest frame when the gap holds no silence", () => {
    // Continuous sound between the turns, dipping in the 560–580 ms frame.
    const pcm = concat(
      tone(500),
      tone(60, 3000),
      tone(20, 400),
      tone(40, 3000),
      tone(500)
    );
    const [cut] = planTurnCuts({
      pcm,
      sampleRate: RATE,
      spans: [
        { firstStart: 0, lastEnd: 0.5 },
        { firstStart: 0.62, lastEnd: 1.12 },
      ],
    });
    expect(cut).toBe(samples(570));
  });

  it("refuses a turn with no words and words running backwards", async () => {
    const pcm = tone(1000);
    const base = {
      audio: bytesOf(pcm),
      mediaType: PCM_MEDIA_TYPE,
      output: undefined,
      turnCount: 2,
    };
    const emptyTurn = await splitConversationTurns({
      ...base,
      timestamps: [{ text: "hi", start: 0, end: 0.2, turnIndex: 0 }],
    }).catch((e: unknown) => e);
    expect(emptyTurn).toBeInstanceOf(TurnSplitError);
    expect(emptyTurn).toMatchObject({ reason: "empty_turn", turnIndex: 1 });
    await expect(
      splitConversationTurns({
        ...base,
        timestamps: [
          { text: "hi", start: 0.5, end: 0.7, turnIndex: 1 },
          { text: "yo", start: 0.8, end: 0.9, turnIndex: 0 },
        ],
      })
    ).rejects.toMatchObject({ reason: "non_monotonic" });
  });

  it("splits the stitch path at its inserted gaps", async () => {
    const result = await generateConversation({
      turns: [
        {
          model: { provider: stitchProvider("a"), modelId: "m" },
          voice: "a",
          text: "hello there",
        },
        {
          model: { provider: stitchProvider("b"), modelId: "m" },
          voice: "b",
          text: "hi back",
        },
      ],
      gapMs: 300,
      timestamps: true,
      splitTurns: true,
    });

    expect(result.metadata.path).toBe("stitch");
    expect(result.metadata.stitchReason).toBe("mixed-models");
    // Turn 0 clip is 700 ms; the gap runs 700–1000 ms. A silence-only cut would land at 800 ms.
    expect(result.turns[0].endMs).toBeCloseTo(850, 6);
    expect(result.turns[1].timestamps[0].start).toBeCloseTo(0.15 + 0.1, 6);
  });

  it("splits native-split blocks at the inserted gap and within blocks at silence", async () => {
    const provider = nativeProvider({ maxTotalChars: 12 });
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "one two" },
        { voice: "b", text: "three" },
        { voice: "a", text: "four five" },
        { voice: "b", text: "six" },
      ],
      gapMs: 400,
      timestamps: true,
      splitTurns: true,
    });

    expect(result.metadata.path).toBe("native-split");
    expect(provider.generateDialogue).toHaveBeenCalledTimes(2);
    // Block 1: words 0–400, silence, 700–900 ms. Gap 900–1300. Block 2 starts at 1300 ms.
    expect(result.turns.map((t) => Math.round(t.endMs))).toEqual([
      550,
      1100,
      1300 + 550,
      1300 + 900,
    ]);
  });

  it("returns slices that concatenate back to the full audio", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "hello there" },
        { voice: "b", text: "hi back" },
        { voice: "a", text: "and again" },
      ],
      timestamps: true,
      splitTurns: true,
    });

    const full = (
      await decodeAudioToPcm16(result.audio.uint8Array, result.audio.mediaType)
    ).pcm;
    const slices = await Promise.all(result.turns.map(decodeTurn));
    expect(concat(...slices)).toEqual(full);
    expect(result.turns.at(-1)?.endMs).toBeCloseTo(
      (full.length / RATE) * 1000,
      6
    );
    for (let i = 1; i < result.turns.length; i++) {
      expect(result.turns[i].startMs).toBe(result.turns[i - 1].endMs);
    }
  });

  it("encodes each slice in the requested output format", async () => {
    const result = await generateConversation({
      model: { provider: nativeProvider(), modelId: "m" },
      turns: TWO_TURNS,
      timestamps: true,
      splitTurns: true,
      output: { format: "mp3" },
    });
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.turns.map((t) => t.audio.mediaType)).toEqual([
      "audio/mpeg",
      "audio/mpeg",
    ]);
  });

  it("splits after a top-level speed change, in the speed step's default format", async () => {
    const result = await generateConversation({
      model: { provider: nativeProvider(), modelId: "m" },
      turns: TWO_TURNS,
      timestamps: true,
      splitTurns: true,
      speed: 1.25,
    });
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.turns.map((t) => t.audio.mediaType)).toEqual([
      "audio/mpeg",
      "audio/mpeg",
    ]);
    // Words are rescaled: turn 0 ends at 320 ms and turn 1 starts at 560 ms.
    expect(result.turns[0].endMs).toBeGreaterThan(320);
    expect(result.turns[0].endMs).toBeLessThan(560);
  });

  it("reports why a conversation was stitched", async () => {
    const provider = nativeProvider();
    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "hello there" },
        { voice: "a", text: "hi back" },
      ],
      timestamps: true,
      splitTurns: true,
    });
    expect(result.metadata.path).toBe("stitch");
    expect(result.metadata.stitchReason).toBe("single-speaker");
    expect(result.turns).toHaveLength(2);
  });

  it("requires timestamps: true", async () => {
    await expect(
      generateConversation({
        model: { provider: nativeProvider(), modelId: "m" },
        turns: TWO_TURNS,
        splitTurns: true,
      })
    ).rejects.toBeInstanceOf(ConversationInputError);
  });

  it("throws before synthesis when native audio has no decodable mode", async () => {
    const provider = nativeProvider({ decodable: false });
    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: TWO_TURNS,
        timestamps: true,
        splitTurns: true,
      })
    ).rejects.toMatchObject({ reason: "undecodable_audio" });
    expect(provider.generateDialogue).not.toHaveBeenCalled();
  });
});
