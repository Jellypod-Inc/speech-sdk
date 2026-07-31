import { decodeAudioToPcm16 } from "../audio-decode.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
} from "../audio-output.js";
import { mapWithConcurrency } from "../concurrency.js";
import { TimestampValidationError, withTurnIndex } from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { combineInstructions } from "../instructions.js";
import { debug } from "../logger.js";
import type { SpeechMetadata } from "../metadata.js";
import type { PronunciationsInput } from "../pronunciations/types.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import type { TimestampProvider } from "../timestamp-provider.js";
import type { ConversationWordTimestamp } from "../timestamps.js";
import {
  concatPcmToWav,
  dbfsToInt16Rms,
  normalizeRms,
  stitchTargetRate,
} from "./pcm-concat.js";
import type { ConversationTurn } from "./types.js";

interface StitchInput<V extends Voice = Voice> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  // When the caller will time-stretch the merged result downstream, skip the
  // final output conversion here so we don't encode → decode → encode.
  readonly deferOutputConversion?: boolean;
  readonly gapMs: number;
  readonly headers?: Record<string, string>;
  readonly instructions?: string;
  readonly maxConcurrency: number;
  readonly maxInputChars?: number;
  readonly maxRetries: number;
  readonly output?: AudioOutput;
  readonly pronunciations?: PronunciationsInput;
  readonly resolvedPerTurn: readonly ResolvedModel<V>[];
  readonly stitchOptionsPerTurn: readonly {
    providerOptions: Record<string, unknown>;
    mediaType: string;
  }[];
  readonly timestampProvider?: TimestampProvider;
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

export async function runStitch<V extends Voice>(
  input: StitchInput<V>
): Promise<StitchOutput> {
  const start = performance.now();

  const perTurn = await mapWithConcurrency(
    input.turns,
    input.maxConcurrency,
    async (turn, i, signal) => {
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
          instructions: combineInstructions(
            input.instructions,
            turn.instructions
          ),
          voice: turn.voice,
          apiKey: input.apiKey,
          providerOptions: mergedProviderOptions,
          maxRetries: input.maxRetries,
          abortSignal: signal,
          headers: input.headers,
          timestamps: input.timestamps,
          timestampProvider: input.timestampProvider,
          pronunciations: input.pronunciations,
          maxInputChars: input.maxInputChars,
          maxConcurrency: input.maxConcurrency,
          speed: turn.speed,
        });
      } catch (err) {
        throw withTurnIndex(err, i);
      }
      // Hume and others omit sample rate from content-type; prefer getStitchOptions.
      const resultMediaType = result.audio.mediaType.toLowerCase();
      const decodeMediaType =
        resultMediaType.startsWith("audio/wav") ||
        resultMediaType.startsWith("audio/x-wav")
          ? result.audio.mediaType
          : stitchOpts.mediaType;
      const segment = await decodeAudioToPcm16(
        result.audio.uint8Array,
        decodeMediaType
      );
      return { result, segment };
    },
    { signal: input.abortSignal }
  );

  const segments = perTurn.map((p) => p.segment);
  const leveledSegments = normalizeRms(
    segments,
    input.volumeDbfs == null ? undefined : dbfsToInt16Rms(input.volumeDbfs)
  );

  const targetSampleRate = stitchTargetRate(leveledSegments);
  const audio = await concatPcmToWav(leveledSegments, {
    gapMs: input.gapMs,
    targetSampleRate,
  });

  const { audio: finalAudio, mediaType } = await applyOptionalOutputConversion({
    audio,
    mediaType: "audio/wav",
    output: input.deferOutputConversion ? undefined : input.output,
  });

  const totalSamples =
    perTurn.reduce(
      (n, p) =>
        n +
        Math.round(
          (p.segment.pcm.length / p.segment.sampleRate) * targetSampleRate
        ),
      0
    ) +
    (perTurn.length - 1) * Math.round((input.gapMs / 1000) * targetSampleRate);
  const audioDurationMs = Math.round((totalSamples / targetSampleRate) * 1000);

  const warnings = [
    ...new Set(perTurn.flatMap((p) => p.result.warnings ?? [])),
  ];
  const metadataPerTurn = perTurn.map((p) => p.result.metadata);
  const providerMetadataPerTurn = perTurn.map((p) => p.result.providerMetadata);

  // Use source duration (pre-resample) so offsets match what the per-turn STT/native saw.
  const gapSeconds = input.gapMs / 1000;
  const turnDurations = perTurn.map(
    (p) => p.segment.pcm.length / p.segment.sampleRate
  );
  let timestamps: ConversationWordTimestamp[] | undefined;
  if (input.timestamps) {
    timestamps = [];
    let offsetSec = 0;
    for (let i = 0; i < perTurn.length; i++) {
      const turnTimestamps = perTurn[i]?.result.timestamps;
      if (!turnTimestamps) {
        throw new TimestampValidationError({
          reason: "empty",
          source: `conversation turn ${i}`,
        });
      }
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
    warnings,
  };
}
