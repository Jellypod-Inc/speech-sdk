import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
  validateOutput,
} from "./audio-output.js";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { DEFAULT_MAX_CONCURRENCY, mapWithConcurrency } from "./concurrency.js";
import { getDefaultSTTFallback } from "./default-stt-fallback.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  assertGatewayForModerationRulesetId,
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  TextChunkingUnsupportedError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import { inverseAlign } from "./pronunciations/inverse-align.js";
import { mergeRules } from "./pronunciations/merge.js";
import { substitute } from "./pronunciations/substitute.js";
import type { Edit, PronunciationsInput } from "./pronunciations/types.js";
import { validatePronunciationsInput } from "./pronunciations/validate.js";
import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
import {
  isSpeechGatewayModel,
  modelDeclaresNativeTimestamps,
  modelMaxInputChars,
  type ResolvedModel,
  type SpeechProvider,
  type StitchTurnOptions,
  type Voice,
} from "./speech-provider.js";
import type { SpeechResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import { resolveMaxInputChars, splitTextByMaxChars } from "./text-chunker.js";
import type { WordTimestamp } from "./timestamps.js";
import type { GenerateSpeechOptions } from "./types.js";

type ProviderGenerateResult = Awaited<ReturnType<SpeechProvider["generate"]>>;

const CHUNK_STITCH_SAMPLE_RATE = 24_000;

export async function generateSpeech<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
>(options: GenerateSpeechOptions<V, M>): Promise<SpeechResult> {
  const {
    model,
    voice,
    abortSignal,
    headers,
    volumeDbfs,
    timestamps = false,
    moderationRulesetId,
  } = options;
  const maxRetries = options.maxRetries ?? 2;

  validateOutput(options.output);

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;
  const isGateway = isSpeechGatewayModel(resolved);

  validatePronunciationsInput(options.pronunciations, isGateway);
  assertGatewayForModerationRulesetId(moderationRulesetId, isGateway);

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

  const { maxInputChars, shouldChunk, textChunks } = resolveTextChunks({
    resolved,
    modelIdentifier,
    isGateway,
    processedText: textToSend,
    userMaxInputChars: options.maxInputChars,
  });

  const { providerOptions, stitchOptions } =
    resolveProviderOptionsForLocalDecoding({
      resolved,
      isGateway,
      modelIdentifier,
      volumeDbfs,
      output: options.output,
      callerOptions: options.providerOptions,
      maxInputChars,
      shouldChunk,
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

  const result = shouldChunk
    ? await generateChunkedSpeech({
        resolved,
        modelIdentifier,
        textChunks,
        voice,
        providerOptions,
        stitchOptions,
        maxInputChars: maxInputChars ?? textToSend.length,
        maxRetries,
        maxConcurrency: options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
        abortSignal,
        headers,
        includeTimestamps: shouldRequestNative,
      })
    : await generateProviderSpeech({
        resolved,
        text: textToSend,
        voice,
        providerOptions,
        maxRetries,
        abortSignal,
        headers,
        includeTimestamps: shouldRequestNative,
        volumeDbfs,
        output: options.output,
        pronunciations: options.pronunciations,
        moderationRulesetId,
      });

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

function resolveTextChunks(args: {
  resolved: ResolvedModel;
  modelIdentifier: string;
  isGateway: boolean;
  processedText: string;
  userMaxInputChars: number | undefined;
}): {
  maxInputChars: number | undefined;
  shouldChunk: boolean;
  textChunks: readonly string[];
} {
  if (args.isGateway) {
    if (args.userMaxInputChars != null) {
      debug(
        `${args.modelIdentifier}: maxInputChars is not applied on the speech gateway path; the gateway server owns request processing.`
      );
    }
    return {
      maxInputChars: undefined,
      shouldChunk: false,
      textChunks: [args.processedText],
    };
  }

  const maxInputCharsResolution = resolveMaxInputChars({
    providerMaxInputChars: modelMaxInputChars(args.resolved),
    userMaxInputChars: args.userMaxInputChars,
  });
  if (maxInputCharsResolution.userExceedsProvider) {
    debug(
      `${args.modelIdentifier}: caller maxInputChars=${maxInputCharsResolution.userMaxInputChars} exceeds provider maxInputChars=${maxInputCharsResolution.providerMaxInputChars}; the provider may reject oversized chunks.`
    );
  }

  const maxInputChars = maxInputCharsResolution.value;
  const textChunks =
    maxInputChars == null
      ? [args.processedText]
      : splitTextByMaxChars(args.processedText, maxInputChars);
  const shouldChunk = textChunks.length > 1;
  if (shouldChunk) {
    const source =
      maxInputCharsResolution.source === "user"
        ? "caller maxInputChars"
        : "model maxInputChars";
    debug(
      `${args.modelIdentifier}: split ${args.processedText.length} input chars into ${textChunks.length} chunks using ${source}=${maxInputChars}.`
    );
  }

  return { maxInputChars, shouldChunk, textChunks };
}

async function generateProviderSpeech<V extends Voice>(args: {
  resolved: ResolvedModel<V>;
  text: string;
  voice: V;
  providerOptions: Record<string, unknown> | undefined;
  maxRetries: number;
  abortSignal: AbortSignal | undefined;
  headers: Record<string, string> | undefined;
  includeTimestamps: boolean;
  volumeDbfs?: number;
  output?: AudioOutput;
  pronunciations?: PronunciationsInput;
  moderationRulesetId?: string;
}): Promise<ProviderGenerateResult> {
  return await pRetry(
    () =>
      isSpeechGatewayModel(args.resolved)
        ? (args.resolved.provider as SpeechGatewayProvider).generate({
            modelId: args.resolved.modelId,
            text: args.text,
            voice: args.voice as unknown as string,
            providerOptions: args.providerOptions,
            abortSignal: args.abortSignal,
            headers: args.headers,
            includeTimestamps: args.includeTimestamps,
            volumeDbfs: args.volumeDbfs,
            output: args.output,
            pronunciations: args.pronunciations,
            moderationRulesetId: args.moderationRulesetId,
          })
        : args.resolved.provider.generate({
            modelId: args.resolved.modelId,
            text: args.text,
            voice: args.voice,
            providerOptions: args.providerOptions,
            abortSignal: args.abortSignal,
            headers: args.headers,
            includeTimestamps: args.includeTimestamps,
          }),
    buildRetryOptions({
      maxRetries: args.maxRetries,
      abortSignal: args.abortSignal,
    })
  );
}

async function generateChunkedSpeech<V extends Voice>(args: {
  resolved: ResolvedModel<V>;
  modelIdentifier: string;
  textChunks: readonly string[];
  voice: V;
  providerOptions: Record<string, unknown> | undefined;
  stitchOptions: StitchTurnOptions | undefined;
  maxInputChars: number;
  maxRetries: number;
  maxConcurrency: number;
  abortSignal: AbortSignal | undefined;
  headers: Record<string, string> | undefined;
  includeTimestamps: boolean;
}): Promise<ProviderGenerateResult> {
  if (!args.stitchOptions) {
    throw new TextChunkingUnsupportedError(
      args.modelIdentifier,
      args.maxInputChars
    );
  }
  const stitchOptions = args.stitchOptions;

  const { decodeAudioToPcm16 } = await import("./audio-decode.js");
  const { concatPcmToWav } = await import("./conversation/pcm-concat.js");

  const perChunk = await mapWithConcurrency(
    args.textChunks,
    args.maxConcurrency,
    async (text, _i, signal) => {
      const result = await generateProviderSpeech({
        resolved: args.resolved,
        text,
        voice: args.voice,
        providerOptions: args.providerOptions,
        maxRetries: args.maxRetries,
        abortSignal: signal,
        headers: args.headers,
        includeTimestamps: args.includeTimestamps,
      });
      const audio = new DefaultGeneratedAudioFile({
        data: result.audio,
        mediaType: result.mediaType,
      }).uint8Array;
      if (audio.length === 0) {
        throw new NoSpeechGeneratedError();
      }
      const resultMediaType = result.mediaType.toLowerCase();
      const decodeMediaType =
        resultMediaType.startsWith("audio/wav") ||
        resultMediaType.startsWith("audio/x-wav")
          ? result.mediaType
          : stitchOptions.mediaType;
      const segment = await decodeAudioToPcm16(audio, decodeMediaType);
      return { result, segment };
    },
    { signal: args.abortSignal }
  );

  const segments = perChunk.map((c) => c.segment);
  const audio = await concatPcmToWav(segments, {
    gapMs: 0,
    targetSampleRate: CHUNK_STITCH_SAMPLE_RATE,
  });
  const durationSeconds = segments.reduce(
    (sum, segment) => sum + segment.pcm.length / segment.sampleRate,
    0
  );
  const warnings = perChunk.flatMap((c) => c.result.warnings ?? []);
  const providerMetadataChunks = perChunk.map((c) => c.result.providerMetadata);
  const providerMetadata = providerMetadataChunks.some((m) => m != null)
    ? { chunks: providerMetadataChunks }
    : undefined;

  return {
    audio,
    audioDurationMs: Math.round(durationSeconds * 1000),
    mediaType: "audio/wav",
    providerMetadata,
    timestamps: mergeChunkTimestamps(perChunk),
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

function mergeChunkTimestamps(
  perChunk: readonly {
    result: ProviderGenerateResult;
    segment: { pcm: Int16Array; sampleRate: number };
  }[]
): WordTimestamp[] | undefined {
  if (perChunk.some((c) => !c.result.timestamps?.length)) {
    return;
  }

  const timestamps: WordTimestamp[] = [];
  let offset = 0;
  for (const chunk of perChunk) {
    for (const word of chunk.result.timestamps ?? []) {
      timestamps.push({
        text: word.text,
        start: word.start + offset,
        end: word.end + offset,
      });
    }
    offset += chunk.segment.pcm.length / chunk.segment.sampleRate;
  }
  return timestamps;
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
  maxInputChars: number | undefined;
  shouldChunk: boolean;
}): {
  providerOptions: Record<string, unknown> | undefined;
  stitchOptions: StitchTurnOptions | undefined;
} {
  if (args.isGateway) {
    return { providerOptions: args.callerOptions, stitchOptions: undefined };
  }

  const needsStitchWireFormat = args.volumeDbfs != null || args.shouldChunk;

  if (!needsStitchWireFormat && args.output != null) {
    const native = args.resolved.provider.resolveOutputFormat?.(
      args.resolved.modelId,
      args.output
    );
    if (native) {
      return {
        providerOptions: { ...native.providerOptions, ...args.callerOptions },
        stitchOptions: undefined,
      };
    }

    const stitchOpts = args.resolved.provider.getStitchOptions?.(
      args.resolved.modelId
    );
    if (!stitchOpts) {
      throw new OutputConversionUnsupportedError(args.modelIdentifier);
    }
    return {
      providerOptions: {
        ...args.callerOptions,
        ...stitchOpts.providerOptions,
      },
      stitchOptions: stitchOpts,
    };
  }

  if (!needsStitchWireFormat) {
    return { providerOptions: args.callerOptions, stitchOptions: undefined };
  }

  const stitchOpts = args.resolved.provider.getStitchOptions?.(
    args.resolved.modelId
  );
  if (!stitchOpts) {
    if (args.shouldChunk && args.maxInputChars != null) {
      throw new TextChunkingUnsupportedError(
        args.modelIdentifier,
        args.maxInputChars
      );
    }
    if (args.volumeDbfs != null) {
      throw new VolumeAdjustmentUnsupportedError(args.modelIdentifier);
    }
    throw new OutputConversionUnsupportedError(args.modelIdentifier);
  }
  return {
    providerOptions: {
      ...args.callerOptions,
      ...stitchOpts.providerOptions,
    },
    stitchOptions: stitchOpts,
  };
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
