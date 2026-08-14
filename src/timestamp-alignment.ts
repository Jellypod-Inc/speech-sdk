import { isSpeedActive, scaleTimestamps } from "./apply-speed.js";
import { mapWithConcurrency } from "./concurrency.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  TimestampProviderRequiredError,
  TimestampValidationError,
  withProviderErrorStage,
} from "./errors.js";
import { debug } from "./logger.js";
import {
  inverseAlignWithQuality,
  PRONUNCIATION_TIMESTAMP_ESTIMATE_WARNING,
} from "./pronunciations/inverse-align.js";
import type { Edit } from "./pronunciations/types.js";
import {
  isSpeechGatewayModel,
  modelDeclaresNativeTimestamps,
  type ResolvedModel,
} from "./speech-provider.js";
import { estimateTimestamps } from "./timestamp-estimation.js";
import {
  finalizeTimestamps,
  tokenizeTimestampSource,
} from "./timestamp-finalization.js";
import type { TimestampProvider } from "./timestamp-provider.js";
import {
  concatTimestampsWithOffsets,
  type TimestampsSource,
  type WordTimestamp,
} from "./timestamps.js";

// Forced alignment is unreliable on very short utterances (a single word often returns nothing), and an even distribution over so few words is just as good.
const MIN_ALIGNMENT_WORD_COUNT = 3;

export interface AlignmentAudioChunk {
  audio(): Promise<Uint8Array>;
  readonly durationSeconds: number;
  readonly mediaType: string;
  readonly text: string;
}

export interface TimestampAlignmentResult {
  readonly source?: TimestampsSource;
  readonly timestamps?: readonly WordTimestamp[];
  readonly warnings?: readonly string[];
}

interface TimestampResolutionArgs {
  readonly abortSignal?: AbortSignal;
  readonly alignmentChunks?: readonly AlignmentAudioChunk[];
  readonly audio: Uint8Array;
  readonly audioDurationMs?: number;
  readonly maxConcurrency?: number;
  readonly mediaType: string;
  readonly originalText: string;
  readonly pronunciationEdits: readonly Edit[];
  // Raw provider timings; pre-stretch sources are scaled to final-audio time here, not by the caller.
  readonly providerTimestamps?: readonly WordTimestamp[];
  readonly speed?: number;
  readonly synthesizedText: string;
}

export interface TimestampAlignmentPlan {
  readonly includeNative: boolean;
  resolve(args: TimestampResolutionArgs): Promise<TimestampAlignmentResult>;
}

function scalePreStretch(
  timestamps: readonly WordTimestamp[],
  speed: number | undefined
): readonly WordTimestamp[] {
  return isSpeedActive(speed)
    ? (scaleTimestamps(timestamps, speed) ?? [])
    : timestamps;
}

function finalizeCandidate(args: {
  readonly audioDurationMs?: number;
  readonly source: string;
  readonly text: string;
  readonly timestamps: readonly WordTimestamp[];
}): readonly WordTimestamp[] {
  const finalized = finalizeTimestamps({
    timestamps: args.timestamps,
    text: args.text,
    audioDurationMs: args.audioDurationMs,
  });
  if (!finalized.ok) {
    throw new TimestampValidationError({
      reason: finalized.reason,
      source: args.source,
    });
  }

  debug(`${args.source}: validated ${finalized.timestamps.length} timestamps.`);
  return finalized.timestamps;
}

export async function deriveTimestampsViaProvider(args: {
  readonly abortSignal?: AbortSignal;
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly provider: TimestampProvider;
  readonly text: string;
}): Promise<readonly WordTimestamp[]> {
  try {
    return await args.provider.align({
      abortSignal: args.abortSignal,
      audio: args.audio,
      mediaType: args.mediaType,
      text: args.text,
    });
  } catch (error) {
    throw withProviderErrorStage(error, "alignment");
  }
}

function projectPublicText(args: {
  readonly audioDurationMs?: number;
  readonly originalText: string;
  readonly pronunciationEdits: readonly Edit[];
  readonly substitutedText: string;
  readonly timestamps: readonly WordTimestamp[];
}): TimestampAlignmentResult {
  if (args.pronunciationEdits.length === 0) {
    return { timestamps: args.timestamps };
  }

  const mapped = inverseAlignWithQuality(
    args.timestamps,
    args.substitutedText,
    args.pronunciationEdits
  );
  return {
    timestamps: finalizeCandidate({
      timestamps: mapped.timestamps,
      text: args.originalText,
      audioDurationMs: args.audioDurationMs,
      source: "pronunciation projection",
    }),
    ...(mapped.estimatedBoundaries && {
      warnings: [PRONUNCIATION_TIMESTAMP_ESTIMATE_WARNING],
    }),
  };
}

interface Aligner extends TimestampProvider {
  readonly source: string;
}

function resolveAligner(args: {
  readonly modelIdentifier: string;
  readonly resolved: ResolvedModel;
  readonly timestampProvider?: TimestampProvider;
}): Aligner | undefined {
  const { timestampProvider } = args;
  if (timestampProvider) {
    return {
      source: "timestampProvider",
      align: (input) =>
        deriveTimestampsViaProvider({ ...input, provider: timestampProvider }),
    };
  }

  const fallback = args.resolved.fallbackSTT;
  if (!fallback) {
    return;
  }
  return {
    source: `${fallback.provider.id}/${fallback.modelId}`,
    align: (input) =>
      deriveTimestampsViaSTT({
        ttsModel: args.modelIdentifier,
        audio: input.audio,
        mediaType: input.mediaType,
        text: input.text,
        timestampFallback: fallback,
        abortSignal: input.abortSignal,
      }),
  };
}

// Aligns each synthesis chunk against its own audio (forced alignment has input limits a stitched result exceeds), concatenating with the stitch offsets.
async function alignPerChunk(args: {
  readonly abortSignal?: AbortSignal;
  readonly aligner: Aligner;
  readonly chunks: readonly AlignmentAudioChunk[];
  readonly maxConcurrency: number;
}): Promise<WordTimestamp[]> {
  const perChunkWords = await mapWithConcurrency(
    args.chunks,
    args.maxConcurrency,
    async (chunk, _i, signal) =>
      await args.aligner.align({
        abortSignal: signal,
        audio: await chunk.audio(),
        mediaType: chunk.mediaType,
        text: chunk.text,
      }),
    { signal: args.abortSignal }
  );
  return concatTimestampsWithOffsets(
    args.chunks.map((chunk, index) => ({
      durationSeconds: chunk.durationSeconds,
      words: perChunkWords[index] ?? [],
    }))
  );
}

async function deriveAlignedTimestamps(args: {
  readonly aligner: Aligner;
  readonly resolutionArgs: TimestampResolutionArgs;
}): Promise<readonly WordTimestamp[]> {
  const { aligner, resolutionArgs } = args;
  if (resolutionArgs.alignmentChunks?.length) {
    const chunked = await alignPerChunk({
      abortSignal: resolutionArgs.abortSignal,
      aligner,
      chunks: resolutionArgs.alignmentChunks,
      maxConcurrency: resolutionArgs.maxConcurrency ?? 1,
    });
    // Chunk audio is pre-stretch, unlike the whole-audio path below, which aligns the final audio.
    return scalePreStretch(chunked, resolutionArgs.speed);
  }
  return await aligner.align({
    abortSignal: resolutionArgs.abortSignal,
    audio: resolutionArgs.audio,
    mediaType: resolutionArgs.mediaType,
    text: resolutionArgs.synthesizedText,
  });
}

function finalizeAndProject(args: {
  readonly resolutionArgs: TimestampResolutionArgs;
  readonly source?: TimestampsSource;
  readonly timestamps: readonly WordTimestamp[];
  readonly validationSource: string;
}): TimestampAlignmentResult {
  const finalized = finalizeCandidate({
    timestamps: args.timestamps,
    text: args.resolutionArgs.synthesizedText,
    audioDurationMs: args.resolutionArgs.audioDurationMs,
    source: args.validationSource,
  });
  return {
    ...projectPublicText({
      timestamps: finalized,
      audioDurationMs: args.resolutionArgs.audioDurationMs,
      originalText: args.resolutionArgs.originalText,
      pronunciationEdits: args.resolutionArgs.pronunciationEdits,
      substitutedText: args.resolutionArgs.synthesizedText,
    }),
    ...(args.source && { source: args.source }),
  };
}

interface DirectResolveContext {
  readonly aligner?: Aligner;
  readonly includeNative: boolean;
  readonly modelIdentifier: string;
}

function tryResolveNative(
  modelIdentifier: string,
  resolutionArgs: TimestampResolutionArgs
): { result?: TimestampAlignmentResult; error?: unknown } {
  try {
    return {
      result: finalizeAndProject({
        resolutionArgs,
        source: "native",
        timestamps: scalePreStretch(
          resolutionArgs.providerTimestamps ?? [],
          resolutionArgs.speed
        ),
        validationSource: modelIdentifier,
      }),
    };
  } catch (error) {
    if (!(error instanceof TimestampValidationError)) {
      throw error;
    }
    debug(
      `${modelIdentifier}: native timestamps failed validation (${error.reason}).`
    );
    return { error };
  }
}

async function tryResolveAligned(
  modelIdentifier: string,
  aligner: Aligner,
  resolutionArgs: TimestampResolutionArgs
): Promise<{ result?: TimestampAlignmentResult; error?: unknown }> {
  try {
    return {
      result: finalizeAndProject({
        resolutionArgs,
        source: "aligned",
        timestamps: await deriveAlignedTimestamps({ aligner, resolutionArgs }),
        validationSource: aligner.source,
      }),
    };
  } catch (error) {
    if (resolutionArgs.abortSignal?.aborted) {
      throw error;
    }
    const message = error instanceof Error ? error.message : `${error}`;
    debug(
      `${modelIdentifier}: alignment via ${aligner.source} failed (${message}).`
    );
    return { error };
  }
}

function shouldAttemptAlignment(
  modelIdentifier: string,
  resolutionArgs: TimestampResolutionArgs
): boolean {
  // Without a measured duration the estimated floor cannot stand in, so alignment is always worth attempting.
  const durationKnown =
    resolutionArgs.audioDurationMs != null &&
    resolutionArgs.audioDurationMs > 0;
  if (!durationKnown) {
    return true;
  }
  const wordCount = tokenizeTimestampSource(
    resolutionArgs.synthesizedText
  ).length;
  if (wordCount >= MIN_ALIGNMENT_WORD_COUNT) {
    return true;
  }
  debug(
    `${modelIdentifier}: skipping alignment for ${wordCount} word(s); using estimated timestamps.`
  );
  return false;
}

async function resolveDirectTimestamps(
  context: DirectResolveContext,
  resolutionArgs: TimestampResolutionArgs
): Promise<TimestampAlignmentResult> {
  let lastError: unknown;

  if (context.includeNative) {
    const native = tryResolveNative(context.modelIdentifier, resolutionArgs);
    if (native.result) {
      return native.result;
    }
    lastError = native.error;
  }

  if (
    context.aligner &&
    shouldAttemptAlignment(context.modelIdentifier, resolutionArgs)
  ) {
    const aligned = await tryResolveAligned(
      context.modelIdentifier,
      context.aligner,
      resolutionArgs
    );
    if (aligned.result) {
      return aligned.result;
    }
    lastError = aligned.error;
  }

  // Estimated floor: synthesized audio is never discarded for want of timings.
  const estimated = estimateTimestamps({
    audioDurationMs: resolutionArgs.audioDurationMs,
    text: resolutionArgs.originalText,
  });
  if (estimated == null) {
    throw (
      lastError ??
      new TimestampValidationError({
        reason: "empty",
        source: context.modelIdentifier,
      })
    );
  }
  debug(
    `${context.modelIdentifier}: distributing ${estimated.length} words evenly across the audio duration.`
  );
  return { timestamps: estimated, source: "estimated" };
}

export function prepareTimestampAlignment(args: {
  readonly modelIdentifier: string;
  readonly request: boolean;
  readonly resolved: ResolvedModel;
  readonly timestampProvider?: TimestampProvider;
}): TimestampAlignmentPlan {
  const isGateway = isSpeechGatewayModel(args.resolved);
  const hasNative = modelDeclaresNativeTimestamps(args.resolved);
  const includeNative = args.request && (isGateway || hasNative);
  const aligner = resolveAligner(args);

  if (args.request && !(isGateway || hasNative || aligner)) {
    throw new TimestampProviderRequiredError(args.modelIdentifier);
  }

  if (!args.request) {
    debug(`${args.modelIdentifier}: timestamps disabled.`);
  } else if (includeNative) {
    debug(`${args.modelIdentifier}: requesting native timestamps.`);
  } else if (args.timestampProvider) {
    debug(`${args.modelIdentifier}: using the supplied timestamp provider.`);
  } else {
    debug(`${args.modelIdentifier}: using the configured legacy STT fallback.`);
  }

  return {
    includeNative,
    resolve: async (resolutionArgs) => {
      if (!args.request) {
        return {};
      }

      // Gateway invariant: the SDK is a transport; the gateway server owns the timestamp contract, so its failures surface unchanged.
      if (isGateway) {
        return finalizeAndProject({
          resolutionArgs,
          timestamps: resolutionArgs.providerTimestamps ?? [],
          validationSource: args.modelIdentifier,
        });
      }

      return await resolveDirectTimestamps(
        { aligner, includeNative, modelIdentifier: args.modelIdentifier },
        resolutionArgs
      );
    },
  };
}
