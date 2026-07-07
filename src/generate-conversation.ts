import pRetry from "p-retry";
import {
  applySpeedToAudio,
  isSpeedActive,
  scaleTimestamps,
  validateSpeed,
} from "./apply-speed.js";
import { computeAudioDuration } from "./audio-duration.js";
import {
  applyOptionalOutputConversion,
  sampleRateHintFrom,
  validateOutput,
} from "./audio-output.js";
import { mapWithConcurrency, resolveMaxConcurrency } from "./concurrency.js";
import { chooseConversationPath } from "./conversation/dispatch.js";
import type { Pcm16Segment } from "./conversation/pcm-concat.js";
import type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
import { validateConversationInput } from "./conversation/validate.js";
import { getDefaultSTTFallback } from "./default-stt-fallback.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
} from "./errors.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import { inverseAlign } from "./pronunciations/inverse-align.js";
import { mergeRules } from "./pronunciations/merge.js";
import { substitute } from "./pronunciations/substitute.js";
import type { Edit, Pronunciation } from "./pronunciations/types.js";
import { validatePronunciationsInput } from "./pronunciations/validate.js";
import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
import {
  isSpeechGatewayModel,
  modelDeclaresNativeTimestamps,
  modelMaxInputChars,
  type ResolvedModel,
  type StitchTurnOptions,
  type Voice,
} from "./speech-provider.js";
import type {
  ConversationMetadata,
  ConversationResult,
} from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import { resolveMaxInputChars } from "./text-chunker.js";
import type { ConversationWordTimestamp, WordTimestamp } from "./timestamps.js";

// biome-ignore lint/performance/noBarrelFile: public entry point — re-export error classes so callers get fn + types + errors from one import
export {
  ConversationInputError,
  DialogueConstraintError,
  MixedDispatchError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
export type {
  ConversationMetadata,
  ConversationResult,
} from "./speech-result.js";

const DEFAULT_GAP_MS = 300;
const DEFAULT_MAX_RETRIES = 2;

export async function generateConversation<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> | undefined =
    | string
    | ResolvedModel<V>
    | undefined,
>(options: GenerateConversationOptions<V, M>): Promise<ConversationResult> {
  validateConversationInput(options);
  validateOutput(options.output);
  validateSpeed(options.speed);
  for (const turn of options.turns) {
    validateSpeed(turn.speed);
  }
  const hasPerTurnSpeed = options.turns.some((t) => isSpeedActive(t.speed));

  // Cache string-model resolutions so turns share one provider instance — dispatch compares by reference.
  const stringResolutionCache = new Map<string, ResolvedModel<V>>();
  const resolveOnce = (model: string | ResolvedModel<V>): ResolvedModel<V> => {
    if (typeof model !== "string") {
      return resolveModel(model, {
        apiKey: options.apiKey,
      }) as ResolvedModel<V>;
    }
    const cached = stringResolutionCache.get(model);
    if (cached) {
      return cached;
    }
    const fresh = resolveModel(model, {
      apiKey: options.apiKey,
    }) as ResolvedModel<V>;
    stringResolutionCache.set(model, fresh);
    return fresh;
  };

  const topLevelResolved =
    options.model == null ? undefined : resolveOnce(options.model);
  const resolvedPerTurn: ResolvedModel<V>[] = options.turns.map((turn) => {
    if (turn.model == null && topLevelResolved) {
      return topLevelResolved;
    }
    const model = turn.model;
    if (!model) {
      throw new Error("generateConversation: model is required");
    }
    return resolveOnce(model);
  });

  const forceStitch =
    hasPerTurnSpeed ||
    needsConversationStitchForMaxInputChars({
      resolvedPerTurn,
      turns: options.turns,
      userMaxInputChars: options.maxInputChars,
    });

  const path = chooseConversationPath({
    forceStitch,
    resolvedPerTurn,
    turns: options.turns,
    output: options.output,
  });

  validatePronunciationsInput(options.pronunciations);

  if (path.kind === "gateway") {
    // Gateway handles top-level + per-turn speed server-side; no local stretch.
    return await runGateway({
      options,
      resolvedPerTurn: path.resolvedPerTurn,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    });
  }

  if (path.kind === "native") {
    return await applySpeedToConversationResult({
      result: await runNativeDispatch({
        options,
        resolved: path.resolved,
        blocks: path.blocks,
      }),
      speed: options.speed,
      output: options.output,
    });
  }

  // Lazy-load so native-only callers don't bundle pcm-concat / mediabunny.
  const { runStitch } = await import("./conversation/stitch.js");
  const stitchMaxConcurrency =
    path.reason === "fallback-from-native-voice-count"
      ? 1
      : resolveMaxConcurrency(options.maxConcurrency);
  const stitched = await runStitch({
    resolvedPerTurn,
    turns: options.turns,
    stitchOptionsPerTurn: path.stitchOptionsPerTurn,
    topLevelProviderOptions: options.providerOptions,
    apiKey: options.apiKey,
    gapMs: options.gapMs ?? DEFAULT_GAP_MS,
    maxConcurrency: stitchMaxConcurrency,
    maxInputChars: options.maxInputChars,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    output: options.output,
    volumeDbfs: options.volumeDbfs,
    abortSignal: options.abortSignal,
    headers: options.headers,
    timestamps: options.timestamps ?? false,
    pronunciations: options.pronunciations,
    // Defer output conversion to applySpeedToConversationResult to avoid encoding twice.
    deferOutputConversion: isSpeedActive(options.speed),
  });

  if (stitched.audio.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const metadata: ConversationMetadata = {
    latencyMs: stitched.metadata.latencyMs,
    inputChars: stitched.metadata.inputChars,
    ...(stitched.metadata.audioDurationMs != null && {
      audioDurationMs: stitched.metadata.audioDurationMs,
    }),
    perTurn: stitched.metadataPerTurn,
  };

  let fallbackWarning: string | undefined;
  if (path.reason === "fallback-from-native") {
    fallbackWarning = `native dialogue unavailable because per-turn providerOptions are set; rendered via stitch (${options.turns.length} API calls instead of 1)`;
  } else if (path.reason === "fallback-from-native-oversized") {
    fallbackWarning = `native dialogue exceeds the provider's per-call limit and couldn't be split into voice-valid blocks; rendered via stitch (${options.turns.length} API calls instead of 1)`;
  } else if (path.reason === "fallback-from-native-voice-count") {
    fallbackWarning = `conversation resolves to a single speaker; rendered serially as single-speaker speech (${options.turns.length} generateSpeech calls, maxConcurrency forced to 1) instead of native multi-speaker dialogue`;
  } else if (path.reason === "fallback-from-native-voice-count-exceeded") {
    fallbackWarning = `conversation uses more unique voices than the provider's native dialogue supports; rendered via stitch (${options.turns.length} generateSpeech calls) instead of native multi-speaker dialogue`;
  }
  const combinedWarnings = fallbackWarning
    ? [fallbackWarning, ...stitched.warnings]
    : stitched.warnings;

  return await applySpeedToConversationResult({
    result: {
      audio: new DefaultGeneratedAudioFile({
        data: stitched.audio,
        mediaType: stitched.mediaType,
      }),
      metadata,
      providerMetadata: { turns: stitched.providerMetadataPerTurn },
      warnings: combinedWarnings.length > 0 ? [...combinedWarnings] : undefined,
      timestamps: stitched.timestamps,
    },
    speed: options.speed,
    output: options.output,
  });
}

function needsConversationStitchForMaxInputChars<V extends Voice>(args: {
  resolvedPerTurn: readonly ResolvedModel<V>[];
  turns: readonly ConversationTurn<V>[];
  userMaxInputChars: number | undefined;
}): boolean {
  let forceStitch = false;
  let sawGatewayMaxOverride = false;
  const overrideLogs: string[] = [];

  for (let i = 0; i < args.resolvedPerTurn.length; i++) {
    const resolved = args.resolvedPerTurn[i];
    if (isSpeechGatewayModel(resolved)) {
      sawGatewayMaxOverride ||= args.userMaxInputChars != null;
      continue;
    }

    const resolution = resolveMaxInputChars({
      providerMaxInputChars: modelMaxInputChars(resolved),
      userMaxInputChars: args.userMaxInputChars,
    });
    const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;

    if (resolution.userExceedsProvider) {
      overrideLogs.push(
        `${modelIdentifier}: caller maxInputChars=${resolution.userMaxInputChars} exceeds provider maxInputChars=${resolution.providerMaxInputChars}; the provider may reject oversized chunks.`
      );
    }

    if (
      resolution.value != null &&
      (args.turns[i]?.text.length ?? 0) > resolution.value
    ) {
      forceStitch = true;
    }
  }

  if (sawGatewayMaxOverride) {
    debug(
      "generateConversation: maxInputChars is not applied on the speech gateway path; the gateway server owns request processing."
    );
  }
  if (!forceStitch) {
    for (const message of overrideLogs) {
      debug(message);
    }
  }

  return forceStitch;
}

async function runGateway<V extends Voice>(args: {
  options: GenerateConversationOptions<V>;
  resolvedPerTurn: readonly ResolvedModel<V>[];
  maxRetries: number;
}): Promise<ConversationResult> {
  const { options, resolvedPerTurn, maxRetries } = args;
  const start = performance.now();

  const provider = resolvedPerTurn[0]
    .provider as unknown as SpeechGatewayProvider;

  const includeTimestamps = options.timestamps ?? false;

  // Pick wire shape: shared model when every turn resolved to the same modelId
  // (covers both `options.model` and the case where every turn happened to
  // resolve identically); per-turn model when they diverge.
  const firstModelId = resolvedPerTurn[0].modelId;
  const allSameModel = resolvedPerTurn.every((r) => r.modelId === firstModelId);

  // Object-shaped voices aren't supported on the gateway conversation path.
  const wireTurns = options.turns.map((t, i) => {
    if (typeof t.voice !== "string") {
      throw new Error(
        `speech-gateway/conversation: gateway conversation path requires string voices; turns[${i}].voice is an object.`
      );
    }
    return {
      ...(allSameModel ? {} : { model: resolvedPerTurn[i].modelId }),
      voice: t.voice,
      text: t.text,
      ...(t.providerOptions && { providerOptions: t.providerOptions }),
      ...(t.speed != null && { speed: t.speed }),
    };
  });

  const result = await pRetry(
    () =>
      provider.generateConversation({
        ...(allSameModel && { modelId: firstModelId }),
        turns: wireTurns,
        gapMs: options.gapMs ?? DEFAULT_GAP_MS,
        volumeDbfs: options.volumeDbfs,
        providerOptions: options.providerOptions,
        speed: options.speed,
        abortSignal: options.abortSignal,
        headers: options.headers,
        includeTimestamps,
        output: options.output,
        pronunciations: options.pronunciations,
      }),
    buildRetryOptions({ maxRetries, abortSignal: options.abortSignal })
  );

  const latencyMs = Math.round(performance.now() - start);

  if (result.audio.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const audio = new DefaultGeneratedAudioFile({
    data: result.audio,
    mediaType: result.mediaType,
  });
  const audioDurationMs = await computeAudioDuration(
    audio.uint8Array,
    result.mediaType
  );

  const timestamps: readonly ConversationWordTimestamp[] | undefined =
    includeTimestamps ? (result.timestamps ?? []) : undefined;
  const warnings = result.warnings;

  const inputChars = options.turns.reduce((n, t) => n + t.text.length, 0);

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    ...(result.providerMetadata !== undefined && {
      providerMetadata: result.providerMetadata,
    }),
    timestamps,
    warnings: warnings && warnings.length > 0 ? warnings : undefined,
  };
}

async function runNative<V extends Voice>(args: {
  options: GenerateConversationOptions<V>;
  resolved: ResolvedModel<V>;
  maxRetries: number;
}): Promise<ConversationResult> {
  const { options, resolved, maxRetries } = args;
  const start = performance.now();

  if (!resolved.provider.generateDialogue) {
    throw new Error(
      `generateConversation: ${resolved.provider.id}/${resolved.modelId} dispatched to native but generateDialogue missing`
    );
  }

  const generateDialogue = resolved.provider.generateDialogue.bind(
    resolved.provider
  );

  // Force decodable PCM/WAV via getStitchOptions for normalization; if unavailable, emit the provider's mixed audio and warn.
  const stitchOpts = resolved.provider.getStitchOptions?.(resolved.modelId, {
    sampleRate: sampleRateHintFrom(options.output),
  });
  const warnings: string[] = [];
  if (!stitchOpts) {
    warnings.push(
      `${resolved.provider.id}/${resolved.modelId}: native dialogue path returns the provider's mixed audio without volume normalization (no decodable PCM/WAV mode).`
    );
  }

  if (options.output && !stitchOpts) {
    throw new OutputConversionUnsupportedError(
      `${resolved.provider.id}/${resolved.modelId}`
    );
  }

  // Stitch options must win — caller-supplied response_format would break the decoder.
  const dialogueProviderOptions = stitchOpts
    ? { ...options.providerOptions, ...stitchOpts.providerOptions }
    : options.providerOptions;

  const requestTimestamps = options.timestamps ?? false;
  const hasNativeDialogueTimestamps = modelDeclaresNativeTimestamps(resolved);
  const shouldRequestNative = requestTimestamps && hasNativeDialogueTimestamps;

  const dialogueId = `${resolved.provider.id}/${resolved.modelId}`;
  if (!requestTimestamps) {
    debug(`${dialogueId} (dialogue): timestamps: false — skipping alignment.`);
  } else if (shouldRequestNative) {
    debug(
      `${dialogueId} (dialogue): timestamps: true — requesting native dialogue alignment.`
    );
  } else {
    debug(
      `${dialogueId} (dialogue): timestamps: true but no native dialogue alignment — will transcribe mixed audio via STT after rendering (adds a round-trip).`
    );
  }

  const ruleMap = options.pronunciations?.rules?.length
    ? mergeRules(options.pronunciations.rules)
    : null;

  const substitutedTurns = buildSubstitutedTurns(options.turns, ruleMap);

  const result = await pRetry(
    () =>
      generateDialogue({
        modelId: resolved.modelId,
        turns: substitutedTurns.map((t) => ({ voice: t.voice, text: t.text })),
        providerOptions: dialogueProviderOptions,
        abortSignal: options.abortSignal,
        headers: options.headers,
        includeTimestamps: shouldRequestNative,
      }),
    buildRetryOptions({ maxRetries, abortSignal: options.abortSignal })
  );

  const latencyMs = Math.round(performance.now() - start);

  if (result.audio.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const { audio, outputMediaType } = await buildNativeAudio({
    result,
    stitchOpts,
    volumeDbfs: options.volumeDbfs,
  });

  const computedDuration = await computeAudioDuration(
    audio.uint8Array,
    outputMediaType
  );
  const audioDurationMs = computedDuration ?? result.audioDurationMs;

  const { timestamps: rawTimestamps, warnings: attributionWarnings } =
    await resolveNativeDialogueTimestamps({
      requestTimestamps,
      nativeTimestamps: result.timestamps,
      audio: audio.uint8Array,
      mediaType: outputMediaType,
      ttsModel: `${resolved.provider.id}/${resolved.modelId}`,
      resolved,
      abortSignal: options.abortSignal,
      substitutedTurnTexts: substitutedTurns.map((t) => t.text),
    });

  const timestamps = ruleMap
    ? inverseAlignDialogueTimestamps(rawTimestamps, substitutedTurns)
    : rawTimestamps;

  // Defer output conversion to applySpeedToConversationResult when top-level speed
  // is active — otherwise we'd encode here and re-encode in the stretch step.
  const deferOutput = isSpeedActive(options.speed);
  const converted = await applyOptionalOutputConversion({
    audio: audio.uint8Array,
    mediaType: outputMediaType,
    output: deferOutput ? undefined : options.output,
  });
  const finalAudio =
    options.output && !deferOutput
      ? new DefaultGeneratedAudioFile({
          data: converted.audio,
          mediaType: converted.mediaType,
        })
      : audio;

  const inputChars = options.turns.reduce((n, t) => n + t.text.length, 0);

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  const mergedWarnings =
    warnings.length > 0 || attributionWarnings.length > 0
      ? [...warnings, ...attributionWarnings]
      : undefined;

  return {
    audio: finalAudio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: mergedWarnings,
    timestamps,
  };
}

async function runNativeDispatch<V extends Voice>(args: {
  options: GenerateConversationOptions<V>;
  resolved: ResolvedModel<V>;
  blocks: readonly (readonly number[])[] | undefined;
}): Promise<ConversationResult> {
  const { options, resolved, blocks } = args;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  if (blocks && blocks.length > 1) {
    return await runNativeSplit({
      options,
      resolved,
      blocks,
      gapMs: options.gapMs ?? DEFAULT_GAP_MS,
      maxConcurrency: resolveMaxConcurrency(options.maxConcurrency),
      maxRetries,
    });
  }
  return await runNative({ options, resolved, maxRetries });
}

async function runNativeSplit<V extends Voice>(args: {
  options: GenerateConversationOptions<V>;
  resolved: ResolvedModel<V>;
  blocks: readonly (readonly number[])[];
  gapMs: number;
  maxConcurrency: number;
  maxRetries: number;
}): Promise<ConversationResult> {
  const { options, resolved, blocks, gapMs, maxConcurrency, maxRetries } = args;
  const start = performance.now();

  if (!resolved.provider.generateDialogue) {
    throw new Error(
      `generateConversation: ${resolved.provider.id}/${resolved.modelId} dispatched to native-split but generateDialogue missing`
    );
  }
  const generateDialogue = resolved.provider.generateDialogue.bind(
    resolved.provider
  );

  // Splitting decodes each block to PCM to stitch — dispatch only picks this path when a decodable mode exists.
  const stitchOpts = resolved.provider.getStitchOptions?.(resolved.modelId, {
    sampleRate: sampleRateHintFrom(options.output),
  });
  if (!stitchOpts) {
    throw new Error(
      `generateConversation: ${resolved.provider.id}/${resolved.modelId} native-split requires a decodable PCM/WAV mode`
    );
  }

  // Stitch options must win — caller-supplied response_format would break the decoder.
  const dialogueProviderOptions = {
    ...options.providerOptions,
    ...stitchOpts.providerOptions,
  };

  const requestTimestamps = options.timestamps ?? false;
  const shouldRequestNative =
    requestTimestamps && modelDeclaresNativeTimestamps(resolved);

  const ruleMap = options.pronunciations?.rules?.length
    ? mergeRules(options.pronunciations.rules)
    : null;
  const substitutedTurns = buildSubstitutedTurns(options.turns, ruleMap);
  const ttsModel = `${resolved.provider.id}/${resolved.modelId}`;

  const { decodeAudioToPcm16 } = await import("./audio-decode.js");

  const perBlock = await mapWithConcurrency(
    blocks,
    maxConcurrency,
    async (indices, _blockIndex, signal) => {
      const blockTurns = indices.map((i) => substitutedTurns[i]);
      const result = await pRetry(
        () =>
          generateDialogue({
            modelId: resolved.modelId,
            turns: blockTurns.map((t) => ({ voice: t.voice, text: t.text })),
            providerOptions: dialogueProviderOptions,
            abortSignal: signal,
            headers: options.headers,
            includeTimestamps: shouldRequestNative,
          }),
        buildRetryOptions({ maxRetries, abortSignal: signal })
      );
      if (result.audio.length === 0) {
        throw new NoSpeechGeneratedError();
      }
      // generateDialogue may return base64 (string) or raw bytes; normalize before decoding.
      const blockAudio = new DefaultGeneratedAudioFile({
        data: result.audio,
        mediaType: stitchOpts.mediaType,
      }).uint8Array;
      const segment = await decodeAudioToPcm16(
        blockAudio,
        stitchOpts.mediaType
      );
      const { timestamps, warnings } = await resolveNativeDialogueTimestamps({
        requestTimestamps,
        nativeTimestamps: result.timestamps,
        audio: blockAudio,
        mediaType: stitchOpts.mediaType,
        ttsModel,
        resolved,
        abortSignal: signal,
        substitutedTurnTexts: blockTurns.map((t) => t.text),
        pcmSegment: segment,
      });
      return {
        segment,
        timestamps,
        warnings,
        providerMetadata: result.providerMetadata,
      };
    },
    { signal: options.abortSignal }
  );

  const { concatPcmToWav, dbfsToInt16Rms, normalizeRms, stitchTargetRate } =
    await import("./conversation/pcm-concat.js");

  const segments = perBlock.map((p) => p.segment);
  const leveled = normalizeRms(
    segments,
    options.volumeDbfs == null ? undefined : dbfsToInt16Rms(options.volumeDbfs)
  );
  const targetSampleRate = stitchTargetRate(leveled);
  const wav = await concatPcmToWav(leveled, { gapMs, targetSampleRate });

  const timestamps = requestTimestamps
    ? composeBlockTimestamps({
        perBlock,
        blocks,
        gapMs,
        ruleMap,
        substitutedTurns,
      })
    : undefined;

  const deferOutput = isSpeedActive(options.speed);
  const converted = await applyOptionalOutputConversion({
    audio: wav,
    mediaType: "audio/wav",
    output: deferOutput ? undefined : options.output,
  });
  const finalAudio = new DefaultGeneratedAudioFile({
    data: converted.audio,
    mediaType: converted.mediaType,
  });

  // Derive duration from the PCM sample counts (resampled to the stitch rate plus gaps)
  // instead of re-decoding the merged audio — matches the stitch path.
  const gapSamples = Math.round((gapMs / 1000) * targetSampleRate);
  const totalSamples =
    leveled.reduce(
      (n, s) =>
        n + Math.round((s.pcm.length / s.sampleRate) * targetSampleRate),
      0
    ) +
    (leveled.length - 1) * gapSamples;
  const audioDurationMs = Math.round((totalSamples / targetSampleRate) * 1000);

  const inputChars = options.turns.reduce((n, t) => n + t.text.length, 0);
  const metadata: SpeechMetadata = {
    latencyMs: Math.round(performance.now() - start),
    inputChars,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  const warnings = perBlock.flatMap((p) => p.warnings);

  return {
    audio: finalAudio,
    metadata,
    providerMetadata: { blocks: perBlock.map((p) => p.providerMetadata) },
    warnings: warnings.length > 0 ? [...warnings] : undefined,
    timestamps,
  };
}

function composeBlockTimestamps(args: {
  perBlock: readonly {
    segment: Pcm16Segment;
    timestamps: readonly ConversationWordTimestamp[] | undefined;
  }[];
  blocks: readonly (readonly number[])[];
  gapMs: number;
  ruleMap: Map<string, Pronunciation> | null;
  substitutedTurns: readonly { text: string; edits: readonly Edit[] }[];
}): readonly ConversationWordTimestamp[] | undefined {
  const { perBlock, blocks, gapMs, ruleMap, substitutedTurns } = args;
  const composed: ConversationWordTimestamp[] = [];
  const gapSeconds = gapMs / 1000;
  let offsetSec = 0;
  for (let b = 0; b < perBlock.length; b++) {
    const indices = blocks[b];
    const blockTs = perBlock[b].timestamps;
    if (blockTs) {
      for (const w of blockTs) {
        const globalTurnIndex = indices[w.turnIndex] ?? indices.at(-1) ?? 0;
        composed.push({
          text: w.text,
          start: w.start + offsetSec,
          end: w.end + offsetSec,
          turnIndex: globalTurnIndex,
        });
      }
    }
    const seg = perBlock[b].segment;
    offsetSec += seg.pcm.length / seg.sampleRate + gapSeconds;
  }
  return ruleMap
    ? inverseAlignDialogueTimestamps(composed, substitutedTurns)
    : composed;
}

async function resolveNativeDialogueTimestamps<V extends Voice>(args: {
  requestTimestamps: boolean;
  nativeTimestamps: readonly WordTimestamp[] | undefined;
  audio: Uint8Array;
  mediaType: string;
  ttsModel: string;
  resolved: ResolvedModel<V>;
  abortSignal: AbortSignal | undefined;
  substitutedTurnTexts: readonly string[];
  // Already-decoded PCM for the same audio, when the caller has it, to skip a redundant decode.
  pcmSegment?: Pcm16Segment;
}): Promise<{
  timestamps: readonly ConversationWordTimestamp[] | undefined;
  warnings: readonly string[];
}> {
  if (!args.requestTimestamps) {
    return { timestamps: undefined, warnings: [] };
  }

  // Either use native flat timestamps, or derive via STT fallback.
  let flatTimestamps: readonly WordTimestamp[];
  if (args.nativeTimestamps && args.nativeTimestamps.length > 0) {
    flatTimestamps = args.nativeTimestamps;
  } else {
    const fallback =
      args.resolved.fallbackSTT ?? (await getDefaultSTTFallback());
    flatTimestamps = await deriveTimestampsViaSTT({
      ttsModel: args.ttsModel,
      audio: args.audio,
      mediaType: args.mediaType,
      // Combined turn text matching the stitched audio, in turn order, so a
      // fallback can force-align; turnIndex attribution happens downstream.
      text: args.substitutedTurnTexts.join(" "),
      timestampFallback: fallback,
      abortSignal: args.abortSignal,
    });
  }

  const { detectSilenceGaps } = await import(
    "./conversation/silence-detection.js"
  );
  const { attributeTimestamps } = await import(
    "./conversation/attribute-timestamps.js"
  );

  let silenceGaps: readonly import("./conversation/silence-detection.js").SilenceGap[] =
    [];
  try {
    const segment =
      args.pcmSegment ??
      (await (
        await import("./audio-decode.js")
      ).decodeAudioToPcm16(args.audio, args.mediaType));
    const gaps = detectSilenceGaps(segment.pcm, {
      sampleRate: segment.sampleRate,
      minDurationMs: 150,
    });
    silenceGaps = gaps;
  } catch {
    // Decoder couldn't read the audio (e.g., compressed format we can't decode locally).
    // Tier 1 will be skipped; dispatcher falls through to Tier 2/3.
  }

  const result = attributeTimestamps({
    timestamps: flatTimestamps,
    turnTexts: args.substitutedTurnTexts,
    silenceGaps,
  });

  return {
    timestamps: result.timestamps,
    warnings: result.warnings,
  };
}

async function buildNativeAudio(args: {
  result: {
    audio: string | Uint8Array;
    mediaType: string;
  };
  stitchOpts: StitchTurnOptions | undefined;
  volumeDbfs: number | undefined;
}): Promise<{ audio: DefaultGeneratedAudioFile; outputMediaType: string }> {
  let audioBytes: string | Uint8Array = args.result.audio;
  // Hume and others omit sample rate from content-type; prefer stitch mediaType.
  let outputMediaType = args.stitchOpts?.mediaType ?? args.result.mediaType;

  if (args.stitchOpts) {
    const { adjustVolume } = await import("./volume-adjust.js");
    audioBytes = await adjustVolume({
      audio: args.result.audio as Uint8Array,
      mediaType: args.stitchOpts.mediaType,
      volumeDbfs: args.volumeDbfs ?? -20,
    });
    outputMediaType = "audio/wav";
  }

  const audio = new DefaultGeneratedAudioFile({
    data: audioBytes,
    mediaType: outputMediaType,
  });

  return { audio, outputMediaType };
}

function buildSubstitutedTurns<V extends Voice>(
  turns: readonly ConversationTurn<V>[],
  ruleMap: Map<string, Pronunciation> | null
): readonly { voice: V; text: string; edits: readonly Edit[] }[] {
  return turns.map((t) => {
    if (!ruleMap) {
      return { voice: t.voice, text: t.text, edits: [] as readonly Edit[] };
    }
    const subbed = substitute(t.text, ruleMap);
    return { voice: t.voice, text: subbed.text, edits: subbed.edits };
  });
}

async function applySpeedToConversationResult(args: {
  readonly result: ConversationResult;
  readonly speed: number | undefined;
  readonly output: GenerateConversationOptions["output"];
}): Promise<ConversationResult> {
  const { result, speed, output } = args;
  if (!isSpeedActive(speed)) {
    return result;
  }

  const stretched = await applySpeedToAudio({
    audio: result.audio.uint8Array,
    mediaType: result.audio.mediaType,
    speed,
    output,
  });
  const newAudio = new DefaultGeneratedAudioFile({
    data: stretched.audio,
    mediaType: stretched.mediaType,
  });
  const computedDuration = await computeAudioDuration(
    newAudio.uint8Array,
    stretched.mediaType
  );
  const fallbackDurationMs =
    result.metadata.audioDurationMs == null
      ? undefined
      : Math.round(result.metadata.audioDurationMs / speed);
  const audioDurationMs = computedDuration ?? fallbackDurationMs;

  return {
    audio: newAudio,
    metadata: {
      ...result.metadata,
      ...(audioDurationMs != null && { audioDurationMs }),
    },
    providerMetadata: result.providerMetadata,
    warnings: result.warnings,
    timestamps: scaleTimestamps(result.timestamps, speed),
  };
}

function inverseAlignDialogueTimestamps(
  timestamps: readonly ConversationWordTimestamp[] | undefined,
  perTurn: readonly { text: string; edits: readonly Edit[] }[]
): readonly ConversationWordTimestamp[] | undefined {
  if (!timestamps) {
    return timestamps;
  }
  const buckets = new Map<number, ConversationWordTimestamp[]>();
  for (const ts of timestamps) {
    const bucket = buckets.get(ts.turnIndex);
    if (bucket) {
      bucket.push(ts);
    } else {
      buckets.set(ts.turnIndex, [ts]);
    }
  }
  const out: ConversationWordTimestamp[] = [];
  for (let i = 0; i < perTurn.length; i++) {
    const turnTimestamps = buckets.get(i);
    if (!turnTimestamps?.length) {
      continue;
    }
    const turn = perTurn[i];
    if (turn.edits.length === 0) {
      out.push(...turnTimestamps);
    } else {
      out.push(...inverseAlign(turnTimestamps, turn.text, turn.edits));
    }
  }
  return out;
}
