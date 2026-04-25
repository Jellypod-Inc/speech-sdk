import { generateSpeech } from "../generate-speech.js";
import { debug } from "../logger.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import type { ResolvedSTTModel } from "../speech-to-text-provider.js";
import type {
  ConversationWordTimestamp,
  TimestampMode,
} from "../timestamps.js";
import {
  concatPcmToWav,
  dbfsToInt16Rms,
  decodeToPcm16,
  normalizeRms,
} from "./pcm-concat.js";
import type { ConversationTurn } from "./types.js";

interface StitchInput<V extends Voice = Voice> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  readonly gapMs: number;
  readonly headers?: Record<string, string>;
  readonly maxConcurrency: number;
  readonly maxRetries: number;
  readonly normalizeVolume: boolean;
  readonly resolvedPerTurn: readonly ResolvedModel<V>[];
  readonly stitchOptionsPerTurn: readonly {
    providerOptions: Record<string, unknown>;
    mediaType: string;
  }[];
  readonly timestampFallback?: ResolvedSTTModel;
  readonly timestamps: TimestampMode;
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
  readonly providerMetadataPerTurn: readonly (
    | Record<string, unknown>
    | undefined
  )[];
  readonly timestamps?: readonly ConversationWordTimestamp[];
  readonly warnings: readonly string[];
}

const TARGET_SAMPLE_RATE = 24_000;

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
      const result = await generateSpeech({
        model: resolved,
        text: turn.text,
        voice: turn.voice,
        apiKey: input.apiKey,
        providerOptions: mergedProviderOptions,
        maxRetries: input.maxRetries,
        abortSignal: input.abortSignal,
        headers: input.headers,
        timestamps: input.timestamps,
        timestampFallback: input.timestampFallback,
      });
      // Hume and others omit sample rate from content-type; prefer getStitchOptions.
      const segment = decodeToPcm16(
        result.audio.uint8Array,
        stitchOpts.mediaType
      );
      return { result, segment };
    }
  );

  const segments = perTurn.map((p) => p.segment);
  const leveledSegments = input.normalizeVolume
    ? normalizeRms(
        segments,
        input.volumeDbfs == null ? undefined : dbfsToInt16Rms(input.volumeDbfs)
      )
    : segments;

  const audio = await concatPcmToWav(leveledSegments, {
    gapMs: input.gapMs,
    targetSampleRate: TARGET_SAMPLE_RATE,
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
  const providerMetadataPerTurn = perTurn.map((p) => p.result.providerMetadata);

  // Use source duration (pre-resample) so offsets match what the per-turn STT/native saw.
  const gapSeconds = input.gapMs / 1000;
  const turnDurations = perTurn.map(
    (p) => p.segment.pcm.length / p.segment.sampleRate
  );
  const allTurnsHaveTimestamps =
    input.timestamps !== "off" &&
    perTurn.every((p) => p.result.timestamps !== undefined);

  let timestamps: ConversationWordTimestamp[] | undefined;
  if (allTurnsHaveTimestamps) {
    timestamps = [];
    let offsetSec = 0;
    for (let i = 0; i < perTurn.length; i++) {
      const turnTimestamps = perTurn[i]?.result.timestamps ?? [];
      for (const w of turnTimestamps) {
        timestamps.push({
          text: w.text,
          start: w.start + offsetSec,
          end: w.end + offsetSec,
          turnIndex: i,
        });
      }
      offsetSec += (turnDurations[i] ?? 0) + gapSeconds;
    }
    debug(
      `stitch: composed ${timestamps.length} word timestamps across ${perTurn.length} turn(s).`
    );
  } else if (input.timestamps !== "off") {
    const missing = perTurn
      .map((p, i) => (p.result.timestamps === undefined ? i : -1))
      .filter((i) => i !== -1);
    debug(
      `stitch: returning no timestamps — ${missing.length}/${perTurn.length} turn(s) had no alignment data (turns: ${missing.join(", ")}). Use timestamps: "on" and/or mark provider models as native/derived to get full coverage.`
    );
  }

  return {
    audio,
    mediaType: "audio/wav",
    metadata: {
      inputChars: input.turns.reduce((n, t) => n + t.text.length, 0),
      latencyMs: Math.round(performance.now() - start),
      audioDurationMs,
    },
    providerMetadataPerTurn,
    timestamps,
    warnings,
  };
}
