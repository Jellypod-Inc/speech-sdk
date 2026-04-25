import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  ApiError,
  GatewayTimestampsUnavailableError,
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
import type { TimestampMode, WordTimestamp } from "./timestamps.js";

export async function generateSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  apiKey?: string;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * RMS-normalize the returned audio to this dBFS level. Must be ≤ 0.
   *
   * Gateway-routed string models pass this value through to Speech Gateway
   * for server-side normalization. Direct provider factories use the local
   * stitch path: generateSpeech requests decodable PCM/WAV output via
   * `getStitchOptions`, normalizes locally, and returns `audio/wav`.
   * Direct providers throw `VolumeAdjustmentUnsupportedError` if they do not
   * expose a decodable output mode.
   */
  volumeDbfs?: number;
  /**
   * Controls whether the returned `SpeechResult` includes word-level
   * timestamps. Default `"off"`. `"on"` forces word timestamps — native
   * alignment when the TTS provider supplies it, STT fallback otherwise.
   *
   * Gateway-routed string models ask Speech Gateway for timestamps and do not
   * run a client-side STT fallback. Direct providers fall back to STT locally
   * when they cannot return timestamps natively.
   */
  timestamps?: TimestampMode;
  /**
   * Override the STT provider used for the derived-timestamps path. Construct
   * via a factory (e.g. `createOpenAISTT({ apiKey })("whisper-1")`). Only
   * consulted when timestamps are requested AND the TTS provider can't supply
   * them natively. Defaults to OpenAI Whisper read from `OPENAI_API_KEY`.
   */
  timestampProvider?: ResolvedSTTModel;
}): Promise<SpeechResult> {
  const {
    model,
    voice,
    abortSignal,
    headers,
    volumeDbfs,
    timestamps: timestampMode = "off",
    timestampProvider,
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
    // Stitch-mode options are applied last so they win over user-supplied
    // providerOptions — otherwise a caller could silently break the decoder
    // by e.g. passing `response_format: "mp3"` alongside `volumeDbfs`.
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
  const shouldRequestNative =
    timestampMode === "on" && (hasNativeTimestamps || isGateway);

  logTimestampDecision({
    modelIdentifier,
    mode: timestampMode,
    hasNative: hasNativeTimestamps,
    willRequestNative: shouldRequestNative,
    timestampProvider,
  });

  const startTime = performance.now();

  const result = await pRetry(
    () =>
      isSpeechGatewayModel(resolved)
        ? resolved.provider.generate({
            modelId: resolved.modelId,
            text: processedText,
            // Gateway inline mode only accepts string voice IDs. The runtime
            // check in SpeechGatewayProvider.generate() surfaces a clear
            // error if the caller passed a non-string voice.
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

  if (isGateway && timestampMode === "on" && !result.timestamps?.length) {
    throw new GatewayTimestampsUnavailableError(modelIdentifier);
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

  const timestamps = await resolveTimestamps({
    timestampMode,
    modelIdentifier,
    resultTimestamps: result.timestamps,
    audio: audio.uint8Array,
    mediaType: outputMediaType,
    timestampProvider,
    abortSignal,
  });

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars: processedText.length,
    provider: resolved.provider.id,
    model: resolved.modelId,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: mergeWarnings(warnings, result.warnings),
    timestamps,
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
  timestampMode: TimestampMode;
  modelIdentifier: string;
  resultTimestamps: readonly WordTimestamp[] | undefined;
  audio: Uint8Array;
  mediaType: string;
  timestampProvider: ResolvedSTTModel | undefined;
  abortSignal: AbortSignal | undefined;
}): Promise<readonly WordTimestamp[] | undefined> {
  const {
    timestampMode,
    modelIdentifier,
    resultTimestamps,
    audio,
    mediaType,
    timestampProvider,
    abortSignal,
  } = args;

  if (timestampMode === "off") {
    return undefined;
  }

  if (resultTimestamps?.length) {
    debug(
      `${modelIdentifier}: returned ${resultTimestamps.length} native word timestamps.`
    );
    return resultTimestamps;
  }

  const timestamps = await deriveTimestampsViaSTT({
    ttsModel: modelIdentifier,
    audio,
    mediaType,
    timestampProvider,
    abortSignal,
  });
  debug(
    `${modelIdentifier}: derived ${timestamps.length} word timestamps via STT fallback.`
  );
  return timestamps;
}

function preprocessText(
  resolved: ResolvedModel,
  rawText: string,
  modelIdentifier: string
): { text: string; warnings: string[] } {
  if (resolved.provider.processAudioTags) {
    return resolved.provider.processAudioTags(rawText, resolved.modelId);
  }
  const tags = detectAudioTags(rawText);
  if (tags.length > 0) {
    return stripAudioTags(rawText, modelIdentifier);
  }
  return { text: rawText, warnings: [] };
}

/**
 * Logs the timestamp routing decision at debug level so developers can see
 * why they are / aren't getting alignment data. Silent unless `DEBUG`
 * includes `speech-sdk` (or `*`).
 */
function logTimestampDecision(args: {
  modelIdentifier: string;
  mode: TimestampMode;
  hasNative: boolean;
  willRequestNative: boolean;
  timestampProvider: ResolvedSTTModel | undefined;
}): void {
  const { modelIdentifier, mode, willRequestNative } = args;
  if (mode === "off") {
    debug(`${modelIdentifier}: timestamps: "off" — skipping alignment.`);
    return;
  }
  if (willRequestNative) {
    debug(
      `${modelIdentifier}: timestamps: "on" — requesting native alignment from the provider.`
    );
    return;
  }
  // mode === "on" and no native support → will fall back to STT
  debug(
    `${modelIdentifier}: timestamps: "on" but no native alignment available — will pipe synthesized audio through ${describeSTTTarget(args.timestampProvider)} for word timestamps (adds a round-trip).`
  );
}

function describeSTTTarget(provider: ResolvedSTTModel | undefined): string {
  if (provider) {
    return `${provider.provider.id}/${provider.modelId}`;
  }
  return "openai/whisper-1 (default)";
}
