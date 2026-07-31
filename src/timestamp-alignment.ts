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
import { finalizeTimestamps } from "./timestamp-finalization.js";
import type { TimestampProvider } from "./timestamp-provider.js";
import type { WordTimestamp } from "./timestamps.js";

export interface TimestampAlignmentResult {
  readonly timestamps?: readonly WordTimestamp[];
  readonly warnings?: readonly string[];
}

export interface TimestampAlignmentPlan {
  readonly includeNative: boolean;
  resolve(args: {
    readonly abortSignal?: AbortSignal;
    readonly audio: Uint8Array;
    readonly audioDurationMs?: number;
    readonly mediaType: string;
    readonly originalText: string;
    readonly pronunciationEdits: readonly Edit[];
    readonly providerTimestamps?: readonly WordTimestamp[];
    readonly synthesizedText: string;
  }): Promise<TimestampAlignmentResult>;
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
    resolve: async (resolutionArgs) => {
      if (!args.request) {
        return {};
      }

      let finalized: readonly WordTimestamp[];
      if (includeNative) {
        try {
          finalized = finalizeCandidate({
            timestamps: resolutionArgs.providerTimestamps ?? [],
            text: resolutionArgs.synthesizedText,
            audioDurationMs: resolutionArgs.audioDurationMs,
            source: args.modelIdentifier,
          });
        } catch (error) {
          if (
            isGateway ||
            !args.timestampProvider ||
            !(error instanceof TimestampValidationError)
          ) {
            throw error;
          }
          debug(
            `${args.modelIdentifier}: native timestamps failed validation (${error.reason}); using the supplied timestamp provider.`
          );
          const timestamps = await deriveTimestampsViaProvider({
            abortSignal: resolutionArgs.abortSignal,
            audio: resolutionArgs.audio,
            mediaType: resolutionArgs.mediaType,
            provider: args.timestampProvider,
            text: resolutionArgs.synthesizedText,
          });
          finalized = finalizeCandidate({
            timestamps,
            text: resolutionArgs.synthesizedText,
            audioDurationMs: resolutionArgs.audioDurationMs,
            source: "timestampProvider",
          });
        }
      } else if (args.timestampProvider) {
        const timestamps = await deriveTimestampsViaProvider({
          abortSignal: resolutionArgs.abortSignal,
          audio: resolutionArgs.audio,
          mediaType: resolutionArgs.mediaType,
          provider: args.timestampProvider,
          text: resolutionArgs.synthesizedText,
        });
        finalized = finalizeCandidate({
          timestamps,
          text: resolutionArgs.synthesizedText,
          audioDurationMs: resolutionArgs.audioDurationMs,
          source: "timestampProvider",
        });
      } else {
        const fallback = args.resolved.fallbackSTT;
        if (!fallback) {
          throw new TimestampProviderRequiredError(args.modelIdentifier);
        }
        const timestamps = await deriveTimestampsViaSTT({
          ttsModel: args.modelIdentifier,
          audio: resolutionArgs.audio,
          mediaType: resolutionArgs.mediaType,
          text: resolutionArgs.synthesizedText,
          timestampFallback: fallback,
          abortSignal: resolutionArgs.abortSignal,
        });
        finalized = finalizeCandidate({
          timestamps,
          text: resolutionArgs.synthesizedText,
          audioDurationMs: resolutionArgs.audioDurationMs,
          source: `${fallback.provider.id}/${fallback.modelId}`,
        });
      }

      return projectPublicText({
        timestamps: finalized,
        audioDurationMs: resolutionArgs.audioDurationMs,
        originalText: resolutionArgs.originalText,
        pronunciationEdits: resolutionArgs.pronunciationEdits,
        substitutedText: resolutionArgs.synthesizedText,
      });
    },
  };
}
