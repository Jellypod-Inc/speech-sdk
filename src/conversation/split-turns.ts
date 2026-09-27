import { decodeAudioToPcm16 } from "../audio-decode.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
} from "../audio-output.js";
import { wrapPcm16Mono } from "../audio-utils.js";
import {
  type ConversationTurnAudio,
  DefaultGeneratedAudioFile,
} from "../speech-result.js";
import type { ConversationWordTimestamp } from "../timestamps.js";
import { TurnSplitError } from "./errors.js";

const FRAME_MS = 20;
const MIN_SILENCE_MS = 100;
const SILENCE_BELOW_REFERENCE_DB = 40;
const REFERENCE_PERCENTILE = 0.9;
const TIMING_EPSILON_SECONDS = 1e-6;

interface TurnSpan {
  readonly firstStart: number;
  readonly lastEnd: number;
}

// Split only when every turn owns words and turn order matches time order.
export function assertTurnSplitAllowed(args: {
  readonly timestamps: readonly ConversationWordTimestamp[];
  readonly turnCount: number;
}): readonly TurnSpan[] {
  const spans: (TurnSpan | undefined)[] = new Array(args.turnCount);
  let previous: ConversationWordTimestamp | undefined;
  for (const word of args.timestamps) {
    if (
      previous &&
      (word.turnIndex < previous.turnIndex ||
        word.start + TIMING_EPSILON_SECONDS < previous.end)
    ) {
      throw new TurnSplitError({
        reason: "non_monotonic",
        turnIndex: word.turnIndex,
      });
    }
    const span = spans[word.turnIndex];
    spans[word.turnIndex] = {
      firstStart: span?.firstStart ?? word.start,
      lastEnd: word.end,
    };
    previous = word;
  }
  const out: TurnSpan[] = [];
  for (let turnIndex = 0; turnIndex < args.turnCount; turnIndex++) {
    const span = spans[turnIndex];
    if (!span) {
      throw new TurnSplitError({ reason: "empty_turn", turnIndex });
    }
    out.push(span);
  }
  return out;
}

function frameRms(pcm: Int16Array, frameSamples: number): Float64Array {
  const frameCount = Math.ceil(pcm.length / frameSamples);
  const rms = new Float64Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    const start = f * frameSamples;
    const end = Math.min(pcm.length, start + frameSamples);
    let sumSq = 0;
    for (let i = start; i < end; i++) {
      sumSq += pcm[i] * pcm[i];
    }
    rms[f] = Math.sqrt(sumSq / (end - start));
  }
  return rms;
}

function silenceThreshold(rms: Float64Array): number {
  if (rms.length === 0) {
    return 0;
  }
  const sorted = Float64Array.from(rms).sort();
  const reference =
    sorted[Math.floor(REFERENCE_PERCENTILE * (sorted.length - 1))];
  return reference * 10 ** (-SILENCE_BELOW_REFERENCE_DB / 20);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Middle of the first qualifying silence in [startSample, endSample]; otherwise the quietest frame there.
function cutInWindow(args: {
  readonly endSample: number;
  readonly frameSamples: number;
  readonly rms: Float64Array;
  readonly startSample: number;
  readonly threshold: number;
}): number {
  const { endSample, frameSamples, rms, startSample, threshold } = args;
  if (endSample <= startSample) {
    return startSample;
  }
  const minFrames = Math.ceil(MIN_SILENCE_MS / FRAME_MS);
  const firstFrame = Math.ceil(startSample / frameSamples);
  const endFrame = Math.min(rms.length, Math.floor(endSample / frameSamples));

  let runStart = -1;
  for (let f = firstFrame; f <= endFrame; f++) {
    if (f < endFrame && rms[f] <= threshold) {
      if (runStart < 0) {
        runStart = f;
      }
      continue;
    }
    if (runStart >= 0 && f - runStart >= minFrames) {
      return clamp(
        Math.round(((runStart + f) * frameSamples) / 2),
        startSample,
        endSample
      );
    }
    runStart = -1;
  }

  let lo = firstFrame;
  let hi = endFrame;
  if (hi <= lo) {
    // Window narrower than a whole frame: consider the frames it overlaps.
    lo = Math.floor(startSample / frameSamples);
    hi = Math.min(rms.length, Math.ceil(endSample / frameSamples));
  }
  if (hi <= lo) {
    return Math.round((startSample + endSample) / 2);
  }
  let quietest = lo;
  for (let f = lo + 1; f < hi; f++) {
    if (rms[f] < rms[quietest]) {
      quietest = f;
    }
  }
  return clamp(
    Math.round((quietest + 0.5) * frameSamples),
    startSample,
    endSample
  );
}

// Returns one cut (sample index) per turn boundary. `knownCutsSec` pins boundaries the SDK stitched itself.
export function planTurnCuts(args: {
  readonly knownCutsSec?: ReadonlyMap<number, number>;
  readonly pcm: Int16Array;
  readonly sampleRate: number;
  readonly spans: readonly TurnSpan[];
}): number[] {
  const { knownCutsSec, pcm, sampleRate, spans } = args;
  const frameSamples = Math.max(1, Math.round((FRAME_MS / 1000) * sampleRate));
  const rms = frameRms(pcm, frameSamples);
  const threshold = silenceThreshold(rms);
  const toSample = (seconds: number) =>
    clamp(Math.round(seconds * sampleRate), 0, pcm.length);

  const cuts: number[] = [];
  for (let b = 0; b < spans.length - 1; b++) {
    const known = knownCutsSec?.get(b);
    const cut =
      known == null
        ? cutInWindow({
            startSample: toSample(spans[b].lastEnd),
            endSample: toSample(spans[b + 1].firstStart),
            frameSamples,
            rms,
            threshold,
          })
        : toSample(known);
    cuts.push(Math.max(cut, cuts.at(-1) ?? 0));
  }
  return cuts;
}

function isDecodable(mediaType: string): boolean {
  const lower = mediaType.toLowerCase();
  return (
    lower.startsWith("audio/wav") ||
    lower.startsWith("audio/x-wav") ||
    lower.startsWith("audio/pcm") ||
    lower.startsWith("audio/x-pcm")
  );
}

export async function splitConversationTurns(args: {
  readonly audio: Uint8Array;
  readonly knownCutsSec?: ReadonlyMap<number, number>;
  readonly mediaType: string;
  readonly output: AudioOutput | undefined;
  readonly timestamps: readonly ConversationWordTimestamp[];
  readonly turnCount: number;
}): Promise<readonly ConversationTurnAudio[]> {
  const spans = assertTurnSplitAllowed(args);
  if (!isDecodable(args.mediaType)) {
    throw new TurnSplitError({ reason: "undecodable_audio" });
  }
  const { pcm, sampleRate } = await decodeAudioToPcm16(
    args.audio,
    args.mediaType
  );
  const cuts = planTurnCuts({
    knownCutsSec: args.knownCutsSec,
    pcm,
    sampleRate,
    spans,
  });

  return await Promise.all(
    spans.map(async (_, turnIndex) => {
      const startSample = turnIndex === 0 ? 0 : cuts[turnIndex - 1];
      const endSample = cuts[turnIndex] ?? pcm.length;
      const slice = pcm.subarray(startSample, endSample);
      const wav = await wrapPcm16Mono(
        new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength),
        sampleRate
      );
      const converted = await applyOptionalOutputConversion({
        audio: wav,
        mediaType: "audio/wav",
        output: args.output,
      });
      const startSec = startSample / sampleRate;
      const durationSec = (endSample - startSample) / sampleRate;
      return {
        turnIndex,
        audio: new DefaultGeneratedAudioFile({
          data: converted.audio,
          mediaType: converted.mediaType,
        }),
        startMs: startSec * 1000,
        endMs: (endSample / sampleRate) * 1000,
        timestamps: args.timestamps
          .filter((w) => w.turnIndex === turnIndex)
          .map((w) => ({
            text: w.text,
            start: clamp(w.start - startSec, 0, durationSec),
            end: clamp(w.end - startSec, 0, durationSec),
          })),
      };
    })
  );
}
