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
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  TimestampProviderRequiredError,
  TimestampValidationError,
} from "./errors.js";
import {
  combineInstructions,
  nonEmptyInstructions,
  validateInstructionSupport,
} from "./instructions.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import {
  inverseAlignWithQuality,
  PRONUNCIATION_TIMESTAMP_ESTIMATE_WARNING,
} from "./pronunciations/inverse-align.js";
import { mergeRules } from "./pronunciations/merge.js";
import { substitute } from "./pronunciations/substitute.js";
import type { Edit, Pronunciation } from "./pronunciations/types.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
import {
  modelDeclaresNativeTimestamps,
  modelMaxInputChars,
  type ResolvedModel,
  type StitchTurnOptions,
  type Voice,
} from "./speech-provider.js";
import type {
  ConversationMetadata,
  ConversationResult,
  ConversationResultWithTimestamps,
} from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import { resolveMaxInputChars } from "./text-chunker.js";
import { preprocessSpeechText } from "./text-preprocessing.js";
import { deriveTimestampsViaProvider } from "./timestamp-alignment.js";
import { finalizeTimestamps } from "./timestamp-finalization.js";
import type { TimestampProvider } from "./timestamp-provider.js";
import type { ConversationWordTimestamp, WordTimestamp } from "./timestamps.js";

// biome-ignore lint/performance/noBarrelFile: public entry point — re-export error classes so callers get fn + types + errors from one import
export {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
export type {
  ConversationMetadata,
  ConversationResult,
  ConversationResultWithTimestamps,
} from "./speech-result.js";

const DEFAULT_GAP_MS = 300;
const DEFAULT_MAX_RETRIES = 2;

function requireValidTimestamps(args: {
  readonly audioDurationMs?: number;
  readonly source: string;
  readonly text: string;
  readonly timestamps: readonly WordTimestamp[];
}): readonly WordTimestamp[] {
  const finalized = finalizeTimestamps({
    audioDurationMs: args.audioDurationMs,
    text: args.text,
    timestamps: args.timestamps,
  });
  if (!finalized.ok) {
    throw new TimestampValidationError({
      reason: finalized.reason,
      source: args.source,
    });
  }
  return finalized.timestamps;
}

// Turns may resolve to different models; name every distinct one so the failure points at a provider.
function describeConversationModels(
  resolvedPerTurn: readonly ResolvedModel<Voice>[]
): string {
  return [
    ...new Set(resolvedPerTurn.map((r) => `${r.provider.id}/${r.modelId}`)),
  ].join(", ");
}

export function generateConversation<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> | undefined =
    | string
    | ResolvedModel<V>
    | undefined,
>(
  options: GenerateConversationOptions<V, M> & { timestamps: true }
): Promise<ConversationResultWithTimestamps>;
export function generateConversation<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> | undefined =
    | string
    | ResolvedModel<V>
    | undefined,
>(options: GenerateConversationOptions<V, M>): Promise<ConversationResult>;
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

  for (const [index, resolved] of resolvedPerTurn.entries()) {
    validateInstructionSupport(
      resolved,
      combineInstructions(
        options.instructions,
        options.turns[index].instructions
      )
    );
  }

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
  const stitched = await runStitch({
    resolvedPerTurn,
    turns: options.turns,
    stitchOptionsPerTurn: path.stitchOptionsPerTurn,
    topLevelProviderOptions: options.providerOptions,
    apiKey: options.apiKey,
    gapMs: options.gapMs ?? DEFAULT_GAP_MS,
    maxConcurrency: resolveMaxConcurrency(options.maxConcurrency),
    maxInputChars: options.maxInputChars,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    output: options.output,
    volumeDbfs: options.volumeDbfs,
    abortSignal: options.abortSignal,
    headers: options.headers,
    instructions: nonEmptyInstructions(options.instructions),
    timestamps: options.timestamps ?? false,
    timestampProvider: options.timestampProvider,
    pronunciations: options.pronunciations,
    // Defer output conversion to applySpeedToConversationResult to avoid encoding twice.
    deferOutputConversion: isSpeedActive(options.speed),
  });

  if (stitched.audio.length === 0) {
    throw new NoSpeechGeneratedError(
      `${describeConversationModels(resolvedPerTurn)}: stitched conversation audio is empty.`
    );
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
    fallbackWarning = `conversation resolves to a single speaker; rendered as sequential single-speaker speech (${options.turns.length} generateSpeech calls) instead of native multi-speaker dialogue`;
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
  const overrideLogs: string[] = [];

  for (let i = 0; i < args.resolvedPerTurn.length; i++) {
    const resolved = args.resolvedPerTurn[i];
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

  if (!forceStitch) {
    for (const message of overrideLogs) {
      debug(message);
    }
  }

  return forceStitch;
}

function finalizeConversationTurnTimestamps(args: {
  readonly audioDurationMs?: number;
  readonly source: string;
  readonly timestamps: readonly ConversationWordTimestamp[] | undefined;
  readonly turnTexts: readonly string[];
}): readonly ConversationWordTimestamp[] | undefined {
  if (!args.timestamps) {
    return;
  }
  const projected: ConversationWordTimestamp[] = [];
  for (const [turnIndex, text] of args.turnTexts.entries()) {
    const turnTimestamps = args.timestamps.filter(
      (timestamp) => timestamp.turnIndex === turnIndex
    );
    const finalized = requireValidTimestamps({
      audioDurationMs: args.audioDurationMs,
      source: args.source,
      text,
      timestamps: turnTimestamps,
    });
    projected.push(
      ...finalized.map((timestamp) => ({ ...timestamp, turnIndex }))
    );
  }
  requireValidTimestamps({
    audioDurationMs: args.audioDurationMs,
    source: args.source,
    text: args.turnTexts.join(" "),
    timestamps: projected,
  });
  return projected;
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
      `${dialogueId} (dialogue): timestamps: true but no native dialogue alignment — using the configured timestamp provider after rendering.`
    );
  }

  const ruleMap = options.pronunciations?.rules?.length
    ? mergeRules(options.pronunciations.rules)
    : null;

  const substitutedTurns = buildSubstitutedTurns(
    options.turns,
    resolved,
    ruleMap
  );

  const result = await pRetry(
    () =>
      generateDialogue({
        modelId: resolved.modelId,
        turns: substitutedTurns.map((t) => ({
          voice: t.voice,
          text: t.text,
          ...(t.instructions && { instructions: t.instructions }),
        })),
        ...(nonEmptyInstructions(options.instructions) && {
          instructions: options.instructions,
        }),
        providerOptions: dialogueProviderOptions,
        abortSignal: options.abortSignal,
        headers: options.headers,
        includeTimestamps: shouldRequestNative,
      }),
    buildRetryOptions({ maxRetries, abortSignal: options.abortSignal })
  );

  const latencyMs = Math.round(performance.now() - start);

  if (result.audio.length === 0) {
    throw new NoSpeechGeneratedError(
      `${dialogueId}: native dialogue returned empty audio.`
    );
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
      hasNativeTimestamps: hasNativeDialogueTimestamps,
      audio: audio.uint8Array,
      mediaType: outputMediaType,
      ttsModel: `${resolved.provider.id}/${resolved.modelId}`,
      resolved,
      abortSignal: options.abortSignal,
      audioDurationMs,
      substitutedTurnTexts: substitutedTurns.map((t) => t.canonicalText),
      timestampProvider: options.timestampProvider,
    });

  const projection = ruleMap
    ? inverseAlignDialogueTimestamps(rawTimestamps, substitutedTurns)
    : { estimatedBoundaries: false, timestamps: rawTimestamps };
  const timestamps = finalizeConversationTurnTimestamps({
    audioDurationMs,
    source: `${resolved.provider.id}/${resolved.modelId}`,
    timestamps: projection.timestamps,
    turnTexts: substitutedTurns.map((turn) => turn.originalText),
  });

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

  const preprocessingWarnings = substitutedTurns.flatMap(
    (turn) => turn.warnings
  );
  const mergedWarningList = [
    ...warnings,
    ...preprocessingWarnings,
    ...attributionWarnings,
    ...(projection.estimatedBoundaries
      ? [PRONUNCIATION_TIMESTAMP_ESTIMATE_WARNING]
      : []),
  ];
  const mergedWarnings =
    mergedWarningList.length > 0 ? mergedWarningList : undefined;

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
  if (
    options.timestamps &&
    !modelDeclaresNativeTimestamps(resolved) &&
    !options.timestampProvider &&
    !resolved.fallbackSTT
  ) {
    throw new TimestampProviderRequiredError(
      `${resolved.provider.id}/${resolved.modelId}`
    );
  }
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
  const hasNativeTimestamps = modelDeclaresNativeTimestamps(resolved);
  const shouldRequestNative = requestTimestamps && hasNativeTimestamps;

  const ruleMap = options.pronunciations?.rules?.length
    ? mergeRules(options.pronunciations.rules)
    : null;
  const substitutedTurns = buildSubstitutedTurns(
    options.turns,
    resolved,
    ruleMap
  );
  const ttsModel = `${resolved.provider.id}/${resolved.modelId}`;

  const { decodeAudioToPcm16 } = await import("./audio-decode.js");

  const perBlock = await mapWithConcurrency(
    blocks,
    maxConcurrency,
    async (indices, blockIndex, signal) => {
      const blockTurns = indices.map((i) => substitutedTurns[i]);
      const result = await pRetry(
        () =>
          generateDialogue({
            modelId: resolved.modelId,
            turns: blockTurns.map((t) => ({
              voice: t.voice,
              text: t.text,
              ...(t.instructions && { instructions: t.instructions }),
            })),
            ...(nonEmptyInstructions(options.instructions) && {
              instructions: options.instructions,
            }),
            providerOptions: dialogueProviderOptions,
            abortSignal: signal,
            headers: options.headers,
            includeTimestamps: shouldRequestNative,
          }),
        buildRetryOptions({ maxRetries, abortSignal: signal })
      );
      if (result.audio.length === 0) {
        // One silent block fails the whole stitch, and the survivors are otherwise indistinguishable.
        throw new NoSpeechGeneratedError(
          `${ttsModel}: native dialogue block ${blockIndex + 1} of ${blocks.length} returned empty audio (turns ${indices[0] + 1}-${(indices.at(-1) ?? indices[0]) + 1}).`
        );
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
        hasNativeTimestamps,
        audio: blockAudio,
        mediaType: stitchOpts.mediaType,
        ttsModel,
        resolved,
        abortSignal: signal,
        audioDurationMs: (segment.pcm.length / segment.sampleRate) * 1000,
        substitutedTurnTexts: blockTurns.map((t) => t.canonicalText),
        timestampProvider: options.timestampProvider,
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

  const timestampProjection = requestTimestamps
    ? composeBlockTimestamps({
        perBlock,
        blocks,
        gapMs,
        ruleMap,
        substitutedTurns,
      })
    : { estimatedBoundaries: false, timestamps: undefined };
  const timestamps = timestampProjection.timestamps;

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

  const warnings = [
    ...substitutedTurns.flatMap((turn) => turn.warnings),
    ...perBlock.flatMap((p) => p.warnings),
    ...(timestampProjection.estimatedBoundaries
      ? [PRONUNCIATION_TIMESTAMP_ESTIMATE_WARNING]
      : []),
  ];

  return {
    audio: finalAudio,
    metadata,
    providerMetadata: { blocks: perBlock.map((p) => p.providerMetadata) },
    warnings: warnings.length > 0 ? [...warnings] : undefined,
    timestamps,
  };
}

interface DialogueProjectionResult {
  readonly estimatedBoundaries: boolean;
  readonly timestamps: readonly ConversationWordTimestamp[] | undefined;
}

function composeBlockTimestamps(args: {
  perBlock: readonly {
    segment: Pcm16Segment;
    timestamps: readonly ConversationWordTimestamp[] | undefined;
  }[];
  blocks: readonly (readonly number[])[];
  gapMs: number;
  ruleMap: Map<string, Pronunciation> | null;
  substitutedTurns: readonly PreparedConversationTurn[];
}): DialogueProjectionResult {
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
  const projection = ruleMap
    ? inverseAlignDialogueTimestamps(composed, substitutedTurns)
    : { estimatedBoundaries: false, timestamps: composed };
  return {
    estimatedBoundaries: projection.estimatedBoundaries,
    timestamps: finalizeConversationTurnTimestamps({
      source: "native conversation blocks",
      timestamps: projection.timestamps,
      turnTexts: substitutedTurns.map((turn) => turn.originalText),
    }),
  };
}

async function resolveNativeDialogueTimestamps<V extends Voice>(args: {
  requestTimestamps: boolean;
  nativeTimestamps: readonly WordTimestamp[] | undefined;
  hasNativeTimestamps: boolean;
  audio: Uint8Array;
  mediaType: string;
  ttsModel: string;
  resolved: ResolvedModel<V>;
  abortSignal: AbortSignal | undefined;
  audioDurationMs: number | undefined;
  substitutedTurnTexts: readonly string[];
  timestampProvider?: TimestampProvider;
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
  if (args.hasNativeTimestamps) {
    if (!args.nativeTimestamps || args.nativeTimestamps.length === 0) {
      throw new TimestampValidationError({
        reason: "empty",
        source: args.ttsModel,
      });
    }
    flatTimestamps = args.nativeTimestamps;
  } else if (args.timestampProvider) {
    flatTimestamps = await deriveTimestampsViaProvider({
      audio: args.audio,
      mediaType: args.mediaType,
      text: args.substitutedTurnTexts.join(" "),
      provider: args.timestampProvider,
      abortSignal: args.abortSignal,
    });
  } else {
    const fallback = args.resolved.fallbackSTT;
    if (!fallback) {
      throw new TimestampProviderRequiredError(args.ttsModel);
    }
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

  flatTimestamps = requireValidTimestamps({
    audioDurationMs: args.audioDurationMs,
    source: args.ttsModel,
    text: args.substitutedTurnTexts.join(" "),
    timestamps: flatTimestamps,
  });

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
    timestamps: finalizeConversationTurnTimestamps({
      audioDurationMs: args.audioDurationMs,
      source: args.ttsModel,
      timestamps: result.timestamps,
      turnTexts: args.substitutedTurnTexts,
    }),
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

interface PreparedConversationTurn<V extends Voice = Voice> {
  readonly canonicalText: string;
  readonly edits: readonly Edit[];
  readonly instructions?: string;
  readonly originalText: string;
  readonly text: string;
  readonly voice: V;
  readonly warnings: readonly string[];
}

function buildSubstitutedTurns<V extends Voice>(
  turns: readonly ConversationTurn<V>[],
  resolved: ResolvedModel<V>,
  ruleMap: Map<string, Pronunciation> | null
): readonly PreparedConversationTurn<V>[] {
  return turns.map((turn) => {
    const processed = preprocessSpeechText({
      resolved,
      rawText: turn.text,
      modelIdentifier: `${resolved.provider.id}/${resolved.modelId}`,
    });
    if (!ruleMap) {
      return {
        voice: turn.voice,
        text: processed.providerText,
        canonicalText: processed.canonicalText,
        originalText: processed.canonicalText,
        instructions: nonEmptyInstructions(turn.instructions),
        edits: [] as readonly Edit[],
        warnings: processed.warnings,
      };
    }
    const canonicalSubstitution = substitute(processed.canonicalText, ruleMap);
    return {
      voice: turn.voice,
      text: substitute(processed.providerText, ruleMap).text,
      canonicalText: canonicalSubstitution.text,
      originalText: processed.canonicalText,
      instructions: nonEmptyInstructions(turn.instructions),
      edits: canonicalSubstitution.edits,
      warnings: processed.warnings,
    };
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
  perTurn: readonly PreparedConversationTurn[]
): DialogueProjectionResult {
  if (!timestamps) {
    return { estimatedBoundaries: false, timestamps };
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
  let estimatedBoundaries = false;
  for (let i = 0; i < perTurn.length; i++) {
    const turnTimestamps = buckets.get(i);
    if (!turnTimestamps?.length) {
      continue;
    }
    const turn = perTurn[i];
    if (turn.edits.length === 0) {
      out.push(...turnTimestamps);
    } else {
      const projection = inverseAlignWithQuality(
        turnTimestamps,
        turn.canonicalText,
        turn.edits
      );
      out.push(...projection.timestamps);
      estimatedBoundaries ||= projection.estimatedBoundaries;
    }
  }
  return { estimatedBoundaries, timestamps: out };
}
