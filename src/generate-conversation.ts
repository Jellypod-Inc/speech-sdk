import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { chooseConversationPath } from "./conversation/dispatch.js";
import { ConversationInputError } from "./conversation/errors.js";
import type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
import { validateConversationInput } from "./conversation/validate.js";
import { getDefaultSTTFallback } from "./default-stt-fallback.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import { ApiError, NoSpeechGeneratedError } from "./errors.js";
import { debug } from "./logger.js";
import type { SpeechMetadata } from "./metadata.js";
import { isRetriableApiError } from "./provider-utils.js";
import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { resolveModel } from "./resolve-provider.js";
import {
  modelDeclaresNativeTimestamps,
  type ResolvedModel,
  type Voice,
} from "./speech-provider.js";
import type {
  ConversationMetadata,
  ConversationResult,
} from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
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
const DEFAULT_MAX_CONCURRENCY = 6;
const DEFAULT_MAX_RETRIES = 2;

export async function generateConversation<V extends Voice = Voice>(
  options: GenerateConversationOptions<V>
): Promise<ConversationResult> {
  validateConversationInput(options);

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

  const path = chooseConversationPath({
    resolvedPerTurn,
    turns: options.turns,
  });

  if (path.kind === "gateway") {
    return await runGateway({
      options,
      resolvedPerTurn: path.resolvedPerTurn,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    });
  }

  if (path.kind === "native") {
    // Native-dialogue is one API call; per-turn providerOptions can't be honored — fail loudly.
    const turnWithOpts = options.turns.findIndex(
      (t) => t.providerOptions !== undefined
    );
    if (turnWithOpts !== -1) {
      throw new ConversationInputError(
        `turns[${turnWithOpts}].providerOptions is set, but ${path.resolved.provider.id}/${path.resolved.modelId} dispatched to the native dialogue path, which renders all turns in one API call. Per-turn providerOptions are not supported on this path; move them to the top-level providerOptions instead.`
      );
    }
    return await runNative({
      options,
      resolved: path.resolved,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
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
    maxConcurrency: options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    volumeDbfs: options.volumeDbfs,
    abortSignal: options.abortSignal,
    headers: options.headers,
    timestamps: options.timestamps ?? false,
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

  return {
    audio: new DefaultGeneratedAudioFile({
      data: stitched.audio,
      mediaType: stitched.mediaType,
    }),
    metadata,
    providerMetadata: { turns: stitched.providerMetadataPerTurn },
    warnings: stitched.warnings.length > 0 ? [...stitched.warnings] : undefined,
    timestamps: stitched.timestamps,
  };
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
        abortSignal: options.abortSignal,
        headers: options.headers,
        includeTimestamps,
      }),
    {
      retries: maxRetries,
      signal: options.abortSignal,
      shouldRetry: ({ error }) => {
        if (error instanceof ApiError && !isRetriableApiError(error)) {
          return false;
        }
        return true;
      },
    }
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
  const stitchOpts = resolved.provider.getStitchOptions?.(resolved.modelId);
  const warnings: string[] = [];
  if (!stitchOpts) {
    warnings.push(
      `${resolved.provider.id}/${resolved.modelId}: native dialogue path returns the provider's mixed audio without volume normalization (no decodable PCM/WAV mode).`
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

  const result = await pRetry(
    () =>
      generateDialogue({
        modelId: resolved.modelId,
        turns: options.turns.map((t) => ({ voice: t.voice, text: t.text })),
        providerOptions: dialogueProviderOptions,
        abortSignal: options.abortSignal,
        headers: options.headers,
        includeTimestamps: shouldRequestNative,
      }),
    {
      retries: maxRetries,
      signal: options.abortSignal,
      shouldRetry: ({ error }) => {
        if (error instanceof ApiError && !isRetriableApiError(error)) {
          return false;
        }
        return true;
      },
    }
  );

  const latencyMs = Math.round(performance.now() - start);

  if (result.audio.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  let audioBytes: string | Uint8Array = result.audio;
  // Hume and others omit sample rate from content-type; prefer stitch mediaType.
  let outputMediaType = stitchOpts?.mediaType ?? result.mediaType;

  if (stitchOpts) {
    const { adjustVolume } = await import("./volume-adjust.js");
    audioBytes = await adjustVolume({
      audio: result.audio,
      mediaType: stitchOpts.mediaType,
      volumeDbfs: options.volumeDbfs ?? -20,
    });
    outputMediaType = "audio/wav";
  }

  const audio = new DefaultGeneratedAudioFile({
    data: audioBytes,
    mediaType: outputMediaType,
  });

  const computedDuration = await computeAudioDuration(
    audio.uint8Array,
    outputMediaType
  );
  const audioDurationMs = computedDuration ?? result.audioDurationMs;

  const { timestamps, warnings: attributionWarnings } =
    await resolveNativeDialogueTimestamps({
      requestTimestamps,
      nativeTimestamps: result.timestamps,
      audio: audio.uint8Array,
      mediaType: outputMediaType,
      ttsModel: `${resolved.provider.id}/${resolved.modelId}`,
      resolved,
      abortSignal: options.abortSignal,
      turns: options.turns,
    });

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
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: mergedWarnings,
    timestamps,
  };
}

async function resolveNativeDialogueTimestamps<V extends Voice>(args: {
  requestTimestamps: boolean;
  nativeTimestamps: readonly WordTimestamp[] | undefined;
  audio: Uint8Array;
  mediaType: string;
  ttsModel: string;
  resolved: ResolvedModel<V>;
  abortSignal: AbortSignal | undefined;
  turns: readonly ConversationTurn<V>[];
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
      timestampFallback: fallback,
      abortSignal: args.abortSignal,
    });
  }

  const { decodeToPcm16 } = await import("./conversation/pcm-concat.js");
  const { detectSilenceGaps } = await import(
    "./conversation/silence-detection.js"
  );
  const { attributeTimestamps } = await import(
    "./conversation/attribute-timestamps.js"
  );

  let silenceGaps: readonly import("./conversation/silence-detection.js").SilenceGap[] =
    [];
  try {
    const segment = decodeToPcm16(args.audio, args.mediaType);
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
    turnTexts: args.turns.map((t) => t.text),
    silenceGaps,
  });

  return {
    timestamps: result.timestamps,
    warnings: result.warnings,
  };
}
