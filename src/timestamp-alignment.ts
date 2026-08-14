import { isSpeedActive, scaleTimestamps } from "./apply-speed.js";
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
import type { TimestampsSource, WordTimestamp } from "./timestamps.js";

// Forced alignment is unreliable on very short utterances (a single word often returns nothing), and an even distribution over so few words is just as good.
const MIN_ALIGNMENT_WORD_COUNT = 3;

export const TIMESTAMP_ESTIMATED_WARNING =
  "speech-sdk: word timestamps were estimated by distributing words evenly across the audio duration.";

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
  readonly mediaType: string;
  readonly originalText: string;
  readonly pronunciationEdits: readonly Edit[];
  readonly providerTimestamps?: readonly WordTimestamp[];
  readonly speed?: number;
  readonly synthesizedText: string;
}

export interface TimestampAlignmentPlan {
  readonly includeNative: boolean;
  resolve(args: TimestampResolutionArgs): Promise<TimestampAlignmentResult>;
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

interface Aligner {
  align(input: {
    readonly abortSignal?: AbortSignal;
    readonly audio: Uint8Array;
    readonly mediaType: string;
    readonly text: string;
  }): Promise<readonly WordTimestamp[]>;
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
}): Promise<WordTimestamp[]> {
  const timestamps: WordTimestamp[] = [];
  let offsetSeconds = 0;
  for (const chunk of args.chunks) {
    const words = await args.aligner.align({
      abortSignal: args.abortSignal,
      audio: await chunk.audio(),
      mediaType: chunk.mediaType,
      text: chunk.text,
    });
    for (const word of words) {
      timestamps.push({
        text: word.text,
        start: word.start + offsetSeconds,
        end: word.end + offsetSeconds,
      });
    }
    offsetSeconds += chunk.durationSeconds;
  }
  return timestamps;
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
    });
    // Chunk audio is pre-stretch; scale like native timestamps so timings match the final audio.
    return isSpeedActive(resolutionArgs.speed)
      ? (scaleTimestamps(chunked, resolutionArgs.speed) ?? [])
      : chunked;
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
  readonly includeNative: boolean;
  readonly modelIdentifier: string;
  readonly resolved: ResolvedModel;
  readonly timestampProvider?: TimestampProvider;
}

function tryResolveNative(
  context: DirectResolveContext,
  resolutionArgs: TimestampResolutionArgs
): { result?: TimestampAlignmentResult; error?: unknown } {
  try {
    return {
      result: finalizeAndProject({
        resolutionArgs,
        source: "native",
        timestamps: resolutionArgs.providerTimestamps ?? [],
        validationSource: context.modelIdentifier,
      }),
    };
  } catch (error) {
    if (!(error instanceof TimestampValidationError)) {
      throw error;
    }
    debug(
      `${context.modelIdentifier}: native timestamps failed validation (${error.reason}).`
    );
    return { error };
  }
}

async function tryResolveAligned(
  context: DirectResolveContext,
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
      `${context.modelIdentifier}: alignment via ${aligner.source} failed (${message}).`
    );
    return { error };
  }
}

async function resolveDirectTimestamps(
  context: DirectResolveContext,
  resolutionArgs: TimestampResolutionArgs
): Promise<TimestampAlignmentResult> {
  let lastError: unknown;

  if (context.includeNative) {
    const native = tryResolveNative(context, resolutionArgs);
    if (native.result) {
      return native.result;
    }
    lastError = native.error;
  }

  const estimated = estimateTimestamps({
    audioDurationMs: resolutionArgs.audioDurationMs,
    text: resolutionArgs.originalText,
  });
  const wordCount = tokenizeTimestampSource(
    resolutionArgs.synthesizedText
  ).length;
  const aligner = resolveAligner(context);
  // Only skip alignment for tiny inputs when the estimated floor can actually stand in.
  const skipAlignment =
    estimated != null && wordCount < MIN_ALIGNMENT_WORD_COUNT;

  if (aligner && skipAlignment) {
    debug(
      `${context.modelIdentifier}: skipping alignment for ${wordCount} word(s); using estimated timestamps.`
    );
  } else if (aligner) {
    const aligned = await tryResolveAligned(context, aligner, resolutionArgs);
    if (aligned.result) {
      return aligned.result;
    }
    lastError = aligned.error;
  }

  // Estimated floor: synthesized audio is never discarded for want of timings.
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
  return {
    timestamps: estimated,
    warnings: [TIMESTAMP_ESTIMATED_WARNING],
    source: "estimated",
  };
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

  if (
    args.request &&
    !(
      isGateway ||
      hasNative ||
      args.timestampProvider ||
      args.resolved.fallbackSTT
    )
  ) {
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
    resolve: (resolutionArgs) => {
      if (!args.request) {
        return Promise.resolve({});
      }

      // Gateway invariant: the SDK is a transport; the gateway server owns the timestamp contract, so its failures surface unchanged.
      if (isGateway) {
        return Promise.resolve(
          finalizeAndProject({
            resolutionArgs,
            timestamps: resolutionArgs.providerTimestamps ?? [],
            validationSource: args.modelIdentifier,
          })
        );
      }

      return resolveDirectTimestamps(
        {
          includeNative,
          modelIdentifier: args.modelIdentifier,
          resolved: args.resolved,
          timestampProvider: args.timestampProvider,
        },
        resolutionArgs
      );
    },
  };
}
