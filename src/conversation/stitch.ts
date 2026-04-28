import { decodeAudioToPcm16 } from "../audio-decode.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
} from "../audio-output.js";
import { withTurnIndex } from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { debug } from "../logger.js";
import type { SpeechMetadata } from "../metadata.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import type { ConversationWordTimestamp } from "../timestamps.js";
import { concatPcmToWav, dbfsToInt16Rms, normalizeRms } from "./pcm-concat.js";
import { fillTurnTimestampsProportional } from "./proportional-fill.js";
import type { ConversationTurn } from "./types.js";

interface StitchInput<V extends Voice = Voice> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  readonly gapMs: number;
  readonly headers?: Record<string, string>;
  readonly maxConcurrency: number;
  readonly maxRetries: number;
  readonly output?: AudioOutput;
  readonly resolvedPerTurn: readonly ResolvedModel<V>[];
  readonly stitchOptionsPerTurn: readonly {
    providerOptions: Record<string, unknown>;
    mediaType: string;
  }[];
  readonly timestamps: boolean;
  readonly topLevelProviderOptions?: Record<string, unknown>;
  readonly turns: readonly ConversationTurn<V>[];
  readonly volumeDbfs?: number;
}

interface StitchOutput {
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly metadata: {
    readonly inputChars: number;
    readonly latencyMs: number;
    readonly audioDurationMs?: number;
  };
  readonly metadataPerTurn: readonly SpeechMetadata[];
  readonly providerMetadataPerTurn: readonly (
    | Record<string, unknown>
    | undefined
  )[];
  readonly timestamps?: readonly ConversationWordTimestamp[];
  readonly warnings: readonly string[];
}

const TARGET_SAMPLE_RATE = 24_000;
const WHITESPACE_RE = /\s+/;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(Math.max(concurrency, 1), items.length) },
    async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) {
          return;
        }
        results[i] = await worker(items[i], i);
      }
    }
  );
  await Promise.all(runners);
  return results;
}

export async function runStitch<V extends Voice>(
  input: StitchInput<V>
): Promise<StitchOutput> {
  const start = performance.now();

  const perTurn = await mapWithConcurrency(
    input.turns,
    input.maxConcurrency,
    async (turn, i) => {
      const resolved = input.resolvedPerTurn[i];
      const stitchOpts = input.stitchOptionsPerTurn[i];
      const mergedProviderOptions = {
        ...input.topLevelProviderOptions,
        ...turn.providerOptions,
        ...stitchOpts.providerOptions,
      };
      let result: Awaited<ReturnType<typeof generateSpeech>>;
      try {
        result = await generateSpeech({
          model: resolved,
          text: turn.text,
          voice: turn.voice,
          apiKey: input.apiKey,
          providerOptions: mergedProviderOptions,
          maxRetries: input.maxRetries,
          abortSignal: input.abortSignal,
          headers: input.headers,
          timestamps: input.timestamps,
        });
      } catch (err) {
        throw withTurnIndex(err, i);
      }
      // Hume and others omit sample rate from content-type; prefer getStitchOptions.
      const segment = await decodeAudioToPcm16(
        result.audio.uint8Array,
        stitchOpts.mediaType
      );
      return { result, segment };
    }
  );

  const segments = perTurn.map((p) => p.segment);
  const leveledSegments = normalizeRms(
    segments,
    input.volumeDbfs == null ? undefined : dbfsToInt16Rms(input.volumeDbfs)
  );

  const audio = await concatPcmToWav(leveledSegments, {
    gapMs: input.gapMs,
    targetSampleRate: TARGET_SAMPLE_RATE,
  });

  const { audio: finalAudio, mediaType } = await applyOptionalOutputConversion({
    audio,
    mediaType: "audio/wav",
    output: input.output,
  });

  const totalSamples =
    perTurn.reduce(
      (n, p) =>
        n +
        Math.round(
          (p.segment.pcm.length / p.segment.sampleRate) * TARGET_SAMPLE_RATE
        ),
      0
    ) +
    (perTurn.length - 1) *
      Math.round((input.gapMs / 1000) * TARGET_SAMPLE_RATE);
  const audioDurationMs = Math.round(
    (totalSamples / TARGET_SAMPLE_RATE) * 1000
  );

  const warnings = perTurn.flatMap((p) => p.result.warnings ?? []);
  const metadataPerTurn = perTurn.map((p) => p.result.metadata);
  const providerMetadataPerTurn = perTurn.map((p) => p.result.providerMetadata);

  // Use source duration (pre-resample) so offsets match what the per-turn STT/native saw.
  const gapSeconds = input.gapMs / 1000;
  const turnDurations = perTurn.map(
    (p) => p.segment.pcm.length / p.segment.sampleRate
  );
  const fillWarnings: string[] = [];
  let timestamps: ConversationWordTimestamp[] | undefined;
  if (input.timestamps) {
    timestamps = [];
    let offsetSec = 0;
    const filledTurns: number[] = [];
    for (let i = 0; i < perTurn.length; i++) {
      const turnTimestamps = perTurn[i]?.result.timestamps;
      if (turnTimestamps && turnTimestamps.length > 0) {
        for (const w of turnTimestamps) {
          timestamps.push({
            text: w.text,
            start: w.start + offsetSec,
            end: w.end + offsetSec,
            turnIndex: i,
          });
        }
      } else {
        const turnText = input.turns[i]?.text ?? "";
        const tokens = turnText
          .split(WHITESPACE_RE)
          .filter((t) => t.length > 0);
        const turnSec = turnDurations[i] ?? 0;
        const filled = fillTurnTimestampsProportional({
          turnIndex: i,
          tokenCount: tokens.length,
          startSec: offsetSec,
          endSec: offsetSec + turnSec,
          texts: tokens,
        });
        timestamps.push(...filled);
        filledTurns.push(i);
      }
      offsetSec += (turnDurations[i] ?? 0) + gapSeconds;
    }
    if (filledTurns.length > 0) {
      fillWarnings.push(
        `speech-sdk: stitch path filled timestamps for turn(s) [${filledTurns.join(",")}] proportionally — provider returned no per-word alignment for those turns.`
      );
    }
    debug(
      `stitch: composed ${timestamps.length} word timestamps across ${perTurn.length} turn(s); ${filledTurns.length} turn(s) filled proportionally.`
    );
  }

  return {
    audio: finalAudio,
    mediaType,
    metadata: {
      inputChars: input.turns.reduce((n, t) => n + t.text.length, 0),
      latencyMs: Math.round(performance.now() - start),
      audioDurationMs,
    },
    metadataPerTurn,
    providerMetadataPerTurn,
    timestamps,
    warnings:
      warnings.length > 0 || fillWarnings.length > 0
        ? [...warnings, ...fillWarnings]
        : warnings,
  };
}
