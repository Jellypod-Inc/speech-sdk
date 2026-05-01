import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
  validateOutput,
} from "./audio-output.js";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { getDefaultSTTFallback } from "./default-stt-fallback.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import { inverseAlign } from "./pronunciations/inverse-align.js";
import { mergeRules } from "./pronunciations/merge.js";
import { substitute } from "./pronunciations/substitute.js";
import type { Edit, PronunciationsFor } from "./pronunciations/types.js";
import { validatePronunciationsInput } from "./pronunciations/validate.js";
import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
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

export async function generateSpeech<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
>(options: {
  model: M;
  text: string;
  voice: V;
  apiKey?: string;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  // Must be ≤ 0. Direct providers without a decodable output mode throw VolumeAdjustmentUnsupportedError (volumeDbfs) or OutputConversionUnsupportedError (output); gateway forwards both server-side.
  volumeDbfs?: number;
  timestamps?: boolean;
  output?: AudioOutput;
  pronunciations?: PronunciationsFor<M>;
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

  validateOutput(options.output);

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;
  const isGateway = isSpeechGatewayModel(resolved);

  validatePronunciationsInput(options.pronunciations, isGateway);

  const { text: strippedText, warnings } = preprocessText(
    resolved,
    options.text,
    modelIdentifier
  );

  if (strippedText.trim().length === 0) {
    throw new NoSpeechGeneratedError(
      warnings.length > 0
        ? `Text is empty after removing unsupported audio tags for ${modelIdentifier}.`
        : "Text must not be empty."
    );
  }

  let textToSend = strippedText;
  let pronunciationEdits: readonly Edit[] = [];
  if (!isGateway && options.pronunciations?.rules?.length) {
    const ruleMap = mergeRules(options.pronunciations.rules);
    const subbed = substitute(strippedText, ruleMap);
    textToSend = subbed.text;
    pronunciationEdits = subbed.edits;
  }

  const providerOptions = resolveProviderOptionsForLocalDecoding({
    resolved,
    isGateway,
    modelIdentifier,
    volumeDbfs,
    output: options.output,
    callerOptions: options.providerOptions,
  });

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

  const result = await pRetry(() => {
    if (isGateway) {
      const gatewayProvider = resolved.provider as SpeechGatewayProvider;
      return gatewayProvider.generate({
        modelId: resolved.modelId,
        text: textToSend,
        voice: voice as unknown as string,
        providerOptions,
        abortSignal,
        headers,
        includeTimestamps: shouldRequestNative,
        volumeDbfs,
        output: options.output,
        pronunciations: options.pronunciations,
      });
    }
    return resolved.provider.generate({
      modelId: resolved.modelId,
      text: textToSend,
      voice,
      providerOptions,
      abortSignal,
      headers,
      includeTimestamps: shouldRequestNative,
    });
  }, buildRetryOptions({ maxRetries, abortSignal }));

  const latencyMs = Math.round(performance.now() - startTime);

  const audioData = result.audio;

  if (audioData.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const { bytes: outputBytes, mediaType: outputMediaType } = isGateway
    ? { bytes: audioData, mediaType: result.mediaType }
    : await applyLocalAudioPostProcessing({
        audio: audioData,
        mediaType: result.mediaType,
        volumeDbfs,
        output: options.output,
      });

  const audio = new DefaultGeneratedAudioFile({
    data: outputBytes,
    mediaType: outputMediaType,
  });

  const [computedDuration, resolvedTimestamps] = await Promise.all([
    computeAudioDuration(audio.uint8Array, outputMediaType),
    resolveTimestamps({
      timestamps,
      modelIdentifier,
      resolved,
      resultTimestamps: result.timestamps,
      audio: audio.uint8Array,
      mediaType: outputMediaType,
      abortSignal,
    }),
  ]);
  const audioDurationMs = computedDuration ?? result.audioDurationMs;

  const finalTimestamps =
    resolvedTimestamps && pronunciationEdits.length > 0
      ? inverseAlign(resolvedTimestamps, textToSend, pronunciationEdits)
      : resolvedTimestamps;

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars: options.text.length,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: mergeWarnings(warnings, result.warnings),
    timestamps: finalTimestamps,
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

function resolveProviderOptionsForLocalDecoding(args: {
  resolved: ResolvedModel;
  isGateway: boolean;
  modelIdentifier: string;
  volumeDbfs: number | undefined;
  output: AudioOutput | undefined;
  callerOptions: Record<string, unknown> | undefined;
}): Record<string, unknown> | undefined {
  if (args.isGateway) {
    return args.callerOptions;
  }

  // volumeDbfs needs a known-decodable wire format to decode→re-level→re-encode,
  // so SDK-required keys win over caller overrides — otherwise a stray
  // override would silently violate the normalization contract.
  if (args.volumeDbfs != null) {
    const stitchOpts = args.resolved.provider.getStitchOptions?.(
      args.resolved.modelId
    );
    if (!stitchOpts) {
      throw new VolumeAdjustmentUnsupportedError(args.modelIdentifier);
    }
    return { ...args.callerOptions, ...stitchOpts.providerOptions };
  }

  if (args.output != null) {
    // Native path: provider produces the requested format directly, so caller's
    // providerOptions are an explicit escape hatch and win over our defaults
    // (e.g. tweaking bitrate/sample_rate). Post-processing reads the actual
    // response mediaType and adapts.
    const native = args.resolved.provider.resolveOutputFormat?.(
      args.resolved.modelId,
      args.output
    );
    if (native) {
      return { ...native.providerOptions, ...args.callerOptions };
    }
    // Stitch fallback: the SDK MUST decode locally to convert into the
    // requested format, so SDK-required keys win — same rationale as the
    // volumeDbfs path above.
    const stitchOpts = args.resolved.provider.getStitchOptions?.(
      args.resolved.modelId
    );
    if (!stitchOpts) {
      throw new OutputConversionUnsupportedError(args.modelIdentifier);
    }
    return { ...args.callerOptions, ...stitchOpts.providerOptions };
  }

  return args.callerOptions;
}

async function applyLocalAudioPostProcessing(args: {
  audio: string | Uint8Array;
  mediaType: string;
  volumeDbfs: number | undefined;
  output: AudioOutput | undefined;
}): Promise<{ bytes: string | Uint8Array; mediaType: string }> {
  let bytes: string | Uint8Array = args.audio;
  let mediaType = args.mediaType;

  if (args.volumeDbfs != null) {
    const { adjustVolume } = await import("./volume-adjust.js");
    bytes = await adjustVolume({
      audio: args.audio,
      mediaType: args.mediaType,
      volumeDbfs: args.volumeDbfs,
    });
    mediaType = "audio/wav";
  }

  if (args.output != null) {
    const decoded = new DefaultGeneratedAudioFile({
      data: bytes,
      mediaType,
    }).uint8Array;
    const converted = await applyOptionalOutputConversion({
      audio: decoded,
      mediaType,
      output: args.output,
    });
    bytes = converted.audio;
    mediaType = converted.mediaType;
  }

  return { bytes, mediaType };
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
