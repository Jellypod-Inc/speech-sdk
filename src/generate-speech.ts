import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { getDefaultSTTFallback } from "./default-stt-fallback.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  ApiError,
  NoSpeechGeneratedError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import { isRetriableApiError } from "./provider-utils.js";
import { resolveModel } from "./resolve-provider.js";
import {
  isSpeechGatewayModel,
  modelDeclaresNativeTimestamps,
  type ResolvedModel,
  type Voice,
} from "./speech-provider.js";
import type { SpeechResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type { WordTimestamp } from "./timestamps.js";

export async function generateSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  apiKey?: string;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  // Must be ≤ 0. Direct providers without a decodable output mode throw VolumeAdjustmentUnsupportedError; gateway models normalize server-side.
  volumeDbfs?: number;
  timestamps?: boolean;
}): Promise<SpeechResult> {
  const {
    model,
    voice,
    abortSignal,
    headers,
    volumeDbfs,
    timestamps = false,
  } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;
  const isGateway = isSpeechGatewayModel(resolved);

  let providerOptions = options.providerOptions;

  if (volumeDbfs != null && !isGateway) {
    const stitchOpts = resolved.provider.getStitchOptions?.(resolved.modelId);
    if (!stitchOpts) {
      throw new VolumeAdjustmentUnsupportedError(modelIdentifier);
    }
    // Stitch options must win — caller-supplied response_format would break the decoder.
    providerOptions = {
      ...options.providerOptions,
      ...stitchOpts.providerOptions,
    };
  }

  const { text: processedText, warnings } = preprocessText(
    resolved,
    options.text,
    modelIdentifier
  );

  if (processedText.trim().length === 0) {
    throw new NoSpeechGeneratedError(
      warnings.length > 0
        ? `Text is empty after removing unsupported audio tags for ${modelIdentifier}.`
        : "Text must not be empty."
    );
  }

  const hasNativeTimestamps = modelDeclaresNativeTimestamps(resolved);
  const shouldRequestNative = timestamps && (hasNativeTimestamps || isGateway);

  const effectiveFallback =
    !timestamps || shouldRequestNative
      ? undefined
      : (resolved.fallbackSTT ?? (await getDefaultSTTFallback()));
  logTimestampDecision({
    modelIdentifier,
    enabled: timestamps,
    hasNative: hasNativeTimestamps,
    willRequestNative: shouldRequestNative,
    effectiveFallback,
  });

  const startTime = performance.now();

  const result = await pRetry(
    () =>
      isSpeechGatewayModel(resolved)
        ? resolved.provider.generate({
            modelId: resolved.modelId,
            text: processedText,
            // Gateway inline mode only accepts string voice IDs.
            voice: voice as unknown as string,
            providerOptions,
            abortSignal,
            headers,
            includeTimestamps: shouldRequestNative,
            volumeDbfs,
          })
        : resolved.provider.generate({
            modelId: resolved.modelId,
            text: processedText,
            voice,
            providerOptions,
            abortSignal,
            headers,
            includeTimestamps: shouldRequestNative,
          }),
    {
      retries: maxRetries,
      signal: abortSignal,
      shouldRetry: ({ error }) => {
        if (error instanceof ApiError && !isRetriableApiError(error)) {
          return false;
        }
        return true;
      },
    }
  );

  const latencyMs = Math.round(performance.now() - startTime);

  const audioData = result.audio;

  if (audioData.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  let outputBytes: Uint8Array | string = audioData;
  let outputMediaType = result.mediaType;

  if (volumeDbfs != null && !isGateway) {
    const { adjustVolume } = await import("./volume-adjust.js");
    outputBytes = await adjustVolume({
      audio: audioData,
      mediaType: result.mediaType,
      volumeDbfs,
    });
    outputMediaType = "audio/wav";
  }

  const audio = new DefaultGeneratedAudioFile({
    data: outputBytes,
    mediaType: outputMediaType,
  });

  const audioDurationMs =
    (await computeAudioDuration(audio.uint8Array, outputMediaType)) ??
    result.audioDurationMs;

  const resolvedTimestamps = await resolveTimestamps({
    timestamps,
    modelIdentifier,
    resolved,
    resultTimestamps: result.timestamps,
    audio: audio.uint8Array,
    mediaType: outputMediaType,
    abortSignal,
  });

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars: processedText.length,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: mergeWarnings(warnings, result.warnings),
    timestamps: resolvedTimestamps,
  };
}

function mergeWarnings(
  preprocessingWarnings: string[],
  providerWarnings: string[] | undefined
): string[] | undefined {
  const merged = [...preprocessingWarnings, ...(providerWarnings ?? [])];
  return merged.length > 0 ? merged : undefined;
}

async function resolveTimestamps(args: {
  timestamps: boolean;
  modelIdentifier: string;
  resolved: ResolvedModel;
  resultTimestamps: readonly WordTimestamp[] | undefined;
  audio: Uint8Array;
  mediaType: string;
  abortSignal: AbortSignal | undefined;
}): Promise<readonly WordTimestamp[] | undefined> {
  if (!args.timestamps) {
    return;
  }
  if (args.resultTimestamps?.length) {
    debug(
      `${args.modelIdentifier}: returned ${args.resultTimestamps.length} native word timestamps.`
    );
    return args.resultTimestamps;
  }
  if (isSpeechGatewayModel(args.resolved)) {
    return;
  }
  const fallback = args.resolved.fallbackSTT ?? (await getDefaultSTTFallback());
  const timestamps = await deriveTimestampsViaSTT({
    ttsModel: args.modelIdentifier,
    audio: args.audio,
    mediaType: args.mediaType,
    timestampFallback: fallback,
    abortSignal: args.abortSignal,
  });
  debug(
    `${args.modelIdentifier}: derived ${timestamps.length} word timestamps via STT fallback.`
  );
  return timestamps;
}

function preprocessText(
  resolved: ResolvedModel,
  rawText: string,
  modelIdentifier: string
): { text: string; warnings: string[] } {
  // Gateway server handles audio-tag normalization itself — pass raw text through.
  if (isSpeechGatewayModel(resolved)) {
    return { text: rawText, warnings: [] };
  }
  if (resolved.provider.processAudioTags) {
    return resolved.provider.processAudioTags(rawText, resolved.modelId);
  }
  const tags = detectAudioTags(rawText);
  if (tags.length > 0) {
    return stripAudioTags(rawText, modelIdentifier);
  }
  return { text: rawText, warnings: [] };
}

function logTimestampDecision(args: {
  modelIdentifier: string;
  enabled: boolean;
  hasNative: boolean;
  willRequestNative: boolean;
  effectiveFallback: ResolvedSTTModel | undefined;
}): void {
  const { modelIdentifier, enabled, willRequestNative } = args;
  if (!enabled) {
    debug(`${modelIdentifier}: timestamps: false — skipping alignment.`);
    return;
  }
  if (willRequestNative) {
    debug(
      `${modelIdentifier}: timestamps: true — requesting native alignment from the provider.`
    );
    return;
  }
  const target = args.effectiveFallback
    ? `${args.effectiveFallback.provider.id}/${args.effectiveFallback.modelId}`
    : "unconfigured STT fallback";
  debug(
    `${modelIdentifier}: timestamps: true but no native alignment available — will pipe synthesized audio through ${target} for word timestamps (adds a round-trip).`
  );
}
