import pRetry from "p-retry";
import {
  applySpeedToAudio,
  isSpeedActive,
  scaleTimestamps,
  validateSpeed,
} from "./apply-speed.js";
import { computeAudioDuration } from "./audio-duration.js";
import { type AudioFilter, validateFilters } from "./audio-filters.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
  validateOutput,
} from "./audio-output.js";
import { mapWithConcurrency, resolveMaxConcurrency } from "./concurrency.js";
import {
  AudioFiltersUnsupportedError,
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  TextChunkingUnsupportedError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
import { validateInstructionSupport } from "./instructions.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import { mergeRules } from "./pronunciations/merge.js";
import { substitute } from "./pronunciations/substitute.js";
import type { Edit, PronunciationsInput } from "./pronunciations/types.js";
import { validatePronunciationsInput } from "./pronunciations/validate.js";
import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
import {
  isSpeechGatewayModel,
  modelMaxInputChars,
  type ResolvedModel,
  type SpeechProvider,
  type StitchTurnOptions,
  type Voice,
} from "./speech-provider.js";
import type {
  SpeechResult,
  SpeechResultWithTimestamps,
} from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import { resolveMaxInputChars, splitTextByMaxChars } from "./text-chunker.js";
import { preprocessSpeechText } from "./text-preprocessing.js";
import { prepareTimestampAlignment } from "./timestamp-alignment.js";
import type { WordTimestamp } from "./timestamps.js";
import type { GenerateSpeechOptions } from "./types.js";

type ProviderGenerateResult = Awaited<ReturnType<SpeechProvider["generate"]>>;

function chunkStitchTargetRate(
  segments: readonly { sampleRate: number }[]
): number {
  const rate = segments.reduce(
    (m, s) => (s.sampleRate > m ? s.sampleRate : m),
    0
  );
  if (rate <= 0) {
    throw new Error(
      "generateChunkedSpeech: no decoded chunks with a positive sample rate to stitch"
    );
  }
  return rate;
}

export function generateSpeech<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
>(
  options: GenerateSpeechOptions<V, M> & { timestamps: true }
): Promise<SpeechResultWithTimestamps>;
export function generateSpeech<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
>(options: GenerateSpeechOptions<V, M>): Promise<SpeechResult>;
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
    filters,
    timestamps = false,
    speed,
  } = options;
  const maxRetries = options.maxRetries ?? 2;

  validateOutput(options.output);
  validateSpeed(speed);
  validateFilters(filters);

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;
  const isGateway = isSpeechGatewayModel(resolved);

  validatePronunciationsInput(options.pronunciations);

  const { canonicalText, providerText, warnings } = preprocessSpeechText({
    resolved,
    rawText: options.text,
    modelIdentifier,
  });

  if (providerText.trim().length === 0) {
    throw new NoSpeechGeneratedError(
      warnings.length > 0
        ? `Text is empty after removing unsupported audio tags for ${modelIdentifier}.`
        : "Text must not be empty."
    );
  }

  const instructions = validateInstructionSupport(
    resolved,
    options.instructions
  );

  const timestampAlignment = prepareTimestampAlignment({
    modelIdentifier,
    request: timestamps,
    resolved,
    timestampProvider: options.timestampProvider,
  });

  let textToSend = providerText;
  let synthesizedCanonicalText = canonicalText;
  let pronunciationEdits: readonly Edit[] = [];
  if (!isGateway && options.pronunciations?.rules?.length) {
    const ruleMap = mergeRules(options.pronunciations.rules);
    textToSend = substitute(providerText, ruleMap).text;
    const canonicalSubstitution = substitute(canonicalText, ruleMap);
    synthesizedCanonicalText = canonicalSubstitution.text;
    pronunciationEdits = canonicalSubstitution.edits;
  }

  const { maxInputChars, shouldChunk, textChunks } = resolveTextChunks({
    resolved,
    modelIdentifier,
    isGateway,
    processedText: textToSend,
    userMaxInputChars: options.maxInputChars,
  });

  if (isGateway && filters?.length) {
    throw new AudioFiltersUnsupportedError(modelIdentifier);
  }

  const { providerOptions, stitchOptions } =
    resolveProviderOptionsForLocalDecoding({
      resolved,
      isGateway,
      modelIdentifier,
      volumeDbfs,
      filters,
      output: options.output,
      callerOptions: options.providerOptions,
      maxInputChars,
      shouldChunk,
      // Time-stretching needs decodable PCM/WAV input — request the stitch wire format from the provider.
      needsDecodableInput: !isGateway && isSpeedActive(speed),
    });

  const shouldRequestNative = timestampAlignment.includeNative;

  const startTime = performance.now();

  const result = shouldChunk
    ? await generateChunkedSpeech({
        resolved,
        modelIdentifier,
        textChunks,
        instructions,
        voice,
        providerOptions,
        stitchOptions,
        maxInputChars: maxInputChars ?? textToSend.length,
        maxRetries,
        maxConcurrency: resolveMaxConcurrency(options.maxConcurrency),
        abortSignal,
        headers,
        includeTimestamps: shouldRequestNative,
      })
    : await generateProviderSpeech({
        resolved,
        text: textToSend,
        instructions,
        voice,
        providerOptions,
        maxRetries,
        abortSignal,
        headers,
        includeTimestamps: shouldRequestNative,
        volumeDbfs,
        output: options.output,
        pronunciations: options.pronunciations,
        speed,
      });

  const latencyMs = Math.round(performance.now() - startTime);

  const audioData = result.audio;

  if (audioData.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  // Gateway already applied speed server-side; only apply locally for direct paths.
  const localSpeed = isGateway ? undefined : speed;

  const stretched = await finalizeSpeechAudio({
    audioData,
    resultMediaType: result.mediaType,
    isGateway,
    volumeDbfs,
    filters,
    output: options.output,
    speed: localSpeed,
  });

  const audio = new DefaultGeneratedAudioFile({
    data: stretched.audio,
    mediaType: stretched.mediaType,
  });

  const computedDuration = await computeAudioDuration(
    audio.uint8Array,
    stretched.mediaType
  );
  const audioDurationMs =
    computedDuration ??
    maybeScaleDurationMs(result.audioDurationMs, localSpeed);

  const publicAlignment = await timestampAlignment.resolve({
    audio: audio.uint8Array,
    audioDurationMs,
    mediaType: stretched.mediaType,
    originalText: canonicalText,
    pronunciationEdits,
    // Native timestamps reference pre-stretch timing on direct paths; gateway already returns scaled timestamps.
    providerTimestamps: maybeScale(result.timestamps, localSpeed),
    synthesizedText: synthesizedCanonicalText,
    abortSignal,
  });

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
    timestamps: publicAlignment.timestamps,
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
  instructions: string | undefined;
  voice: V;
  providerOptions: Record<string, unknown> | undefined;
  maxRetries: number;
  abortSignal: AbortSignal | undefined;
  headers: Record<string, string> | undefined;
  includeTimestamps: boolean;
  volumeDbfs?: number;
  output?: AudioOutput;
  pronunciations?: PronunciationsInput;
  speed?: number;
}): Promise<ProviderGenerateResult> {
  return await pRetry(
    () =>
      isSpeechGatewayModel(args.resolved)
        ? (args.resolved.provider as SpeechGatewayProvider).generate({
            modelId: args.resolved.modelId,
            text: args.text,
            ...(args.instructions && { instructions: args.instructions }),
            voice: args.voice as unknown as string,
            providerOptions: args.providerOptions,
            abortSignal: args.abortSignal,
            headers: args.headers,
            includeTimestamps: args.includeTimestamps,
            volumeDbfs: args.volumeDbfs,
            output: args.output,
            pronunciations: args.pronunciations,
            speed: args.speed,
          })
        : args.resolved.provider.generate({
            modelId: args.resolved.modelId,
            text: args.text,
            ...(args.instructions && { instructions: args.instructions }),
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
  instructions: string | undefined;
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
        instructions: args.instructions,
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
  const targetSampleRate = chunkStitchTargetRate(segments);
  const audio = await concatPcmToWav(segments, {
    gapMs: 0,
    targetSampleRate,
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

function resolveProviderOptionsForLocalDecoding(args: {
  resolved: ResolvedModel;
  isGateway: boolean;
  modelIdentifier: string;
  volumeDbfs: number | undefined;
  filters: readonly AudioFilter[] | undefined;
  output: AudioOutput | undefined;
  callerOptions: Record<string, unknown> | undefined;
  maxInputChars: number | undefined;
  shouldChunk: boolean;
  needsDecodableInput: boolean;
}): {
  providerOptions: Record<string, unknown> | undefined;
  stitchOptions: StitchTurnOptions | undefined;
} {
  if (args.isGateway) {
    return { providerOptions: args.callerOptions, stitchOptions: undefined };
  }

  const needsStitchWireFormat =
    args.volumeDbfs != null ||
    Boolean(args.filters?.length) ||
    args.shouldChunk ||
    args.needsDecodableInput;

  const sampleRateHint =
    args.output != null && "sampleRate" in args.output
      ? args.output.sampleRate
      : undefined;

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
      args.resolved.modelId,
      { sampleRate: sampleRateHint }
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
    args.resolved.modelId,
    { sampleRate: sampleRateHint }
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
    if (args.filters?.length) {
      throw new AudioFiltersUnsupportedError(args.modelIdentifier);
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
  filters: readonly AudioFilter[] | undefined;
  output: AudioOutput | undefined;
}): Promise<{ bytes: string | Uint8Array; mediaType: string }> {
  let bytes: string | Uint8Array = args.audio;
  let mediaType = args.mediaType;

  if (args.volumeDbfs != null || args.filters?.length) {
    const { adjustVolume } = await import("./volume-adjust.js");
    bytes = await adjustVolume({
      audio: args.audio,
      mediaType: args.mediaType,
      volumeDbfs: args.volumeDbfs,
      filters: args.filters,
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

function maybeScale<T extends { start: number; end: number }>(
  timestamps: readonly T[] | undefined,
  speed: number | undefined
): readonly T[] | undefined {
  return isSpeedActive(speed) ? scaleTimestamps(timestamps, speed) : timestamps;
}

function maybeScaleDurationMs(
  durationMs: number | undefined,
  speed: number | undefined
): number | undefined {
  if (durationMs == null || !isSpeedActive(speed)) {
    return durationMs;
  }
  return Math.round(durationMs / speed);
}

async function finalizeSpeechAudio(args: {
  readonly audioData: string | Uint8Array;
  readonly resultMediaType: string;
  readonly isGateway: boolean;
  readonly volumeDbfs: number | undefined;
  readonly filters: readonly AudioFilter[] | undefined;
  readonly output: AudioOutput | undefined;
  readonly speed: number | undefined;
}): Promise<{ readonly audio: Uint8Array; readonly mediaType: string }> {
  // When speed is active, defer output conversion to applySpeedToAudio — otherwise
  // we'd encode to `output` here and then decode/re-encode in the stretch step,
  // a wasteful round-trip that loses quality on lossy formats.
  const preStretchOutput = isSpeedActive(args.speed) ? undefined : args.output;
  const postProcessed = args.isGateway
    ? { bytes: args.audioData, mediaType: args.resultMediaType }
    : await applyLocalAudioPostProcessing({
        audio: args.audioData,
        mediaType: args.resultMediaType,
        volumeDbfs: args.volumeDbfs,
        filters: args.filters,
        output: preStretchOutput,
      });

  const postProcessedBytes = new DefaultGeneratedAudioFile({
    data: postProcessed.bytes,
    mediaType: postProcessed.mediaType,
  }).uint8Array;

  if (!isSpeedActive(args.speed)) {
    return { audio: postProcessedBytes, mediaType: postProcessed.mediaType };
  }

  return await applySpeedToAudio({
    audio: postProcessedBytes,
    mediaType: postProcessed.mediaType,
    speed: args.speed,
    output: args.output,
  });
}
