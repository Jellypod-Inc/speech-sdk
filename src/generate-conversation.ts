import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { chooseConversationPath } from "./conversation/dispatch.js";
import { ConversationInputError } from "./conversation/errors.js";
import type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
import { validateConversationInput } from "./conversation/validate.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  ApiError,
  ConversationTimestampAttributionError,
  NoSpeechGeneratedError,
} from "./errors.js";
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
import type { ConversationResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type {
  ConversationWordTimestamp,
  TimestampMode,
  WordTimestamp,
} from "./timestamps.js";

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
export { ConversationTimestampAttributionError } from "./errors.js";
export type { ConversationResult } from "./speech-result.js";

const DEFAULT_GAP_MS = 300;
const DEFAULT_MAX_CONCURRENCY = 6;
const DEFAULT_MAX_RETRIES = 2;

// Regexes used by `attributeTimestampsToTurns`. Top-level so they aren't
// recompiled on every word.
const NORMALIZE_LEAD_RE = /^[^\p{L}\p{N}'-]+/u;
const NORMALIZE_TRAIL_RE = /[^\p{L}\p{N}'-]+$/u;
const WHITESPACE_SPLIT_RE = /\s+/;

export async function generateConversation<V extends Voice = Voice>(
  options: GenerateConversationOptions<V>
): Promise<ConversationResult> {
  validateConversationInput(options);

  const topLevelResolved =
    options.model === undefined
      ? undefined
      : (resolveModel(options.model, {
          apiKey: options.apiKey,
        }) as ResolvedModel<V>);
  const resolvedPerTurn: ResolvedModel<V>[] = options.turns.map((turn) => {
    if (turn.model === undefined && topLevelResolved) {
      return topLevelResolved;
    }
    const model = turn.model;
    if (!model) {
      throw new Error("generateConversation: model is required");
    }
    return resolveModel(model, { apiKey: options.apiKey }) as ResolvedModel<V>;
  });

  const path = chooseConversationPath({
    resolvedPerTurn,
    turns: options.turns,
  });

  if (path.kind === "gateway") {
    return await runGateway({
      options,
      resolved: path.resolved,
      maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    });
  }

  if (path.kind === "native") {
    // The native-dialogue path renders the entire script in a single provider
    // API call, so per-turn providerOptions have no well-defined meaning —
    // silently collapsing them to a single blob would lie to the caller. Fail
    // loudly and let them move providerOptions to the top level (where it's
    // forwarded once to the dialogue call) or pick a model that routes
    // through the stitch path.
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

  // Lazy-load the stitch pipeline so callers whose dispatch always picks
  // native (e.g. a Jellypod gateway provider that handles concatenation
  // server-side) never bundle pcm-concat / audio-utils / mediabunny WAV mux.
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
    normalizeVolume: options.normalizeVolume ?? true,
    volumeDbfs: options.volumeDbfs,
    abortSignal: options.abortSignal,
    headers: options.headers,
    timestamps: options.timestamps ?? "off",
    timestampProvider: options.timestampProvider,
  });

  if (stitched.audio.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const providers = Array.from(
    new Set(resolvedPerTurn.map((r) => r.provider.id))
  );
  const models = Array.from(new Set(resolvedPerTurn.map((r) => r.modelId)));

  const metadata: SpeechMetadata = {
    latencyMs: stitched.metadata.latencyMs,
    inputChars: stitched.metadata.inputChars,
    provider: providers.length === 1 ? providers[0] : providers.join(","),
    model: models.length === 1 ? models[0] : models.join(","),
    ...(stitched.metadata.audioDurationMs != null && {
      audioDurationMs: stitched.metadata.audioDurationMs,
    }),
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
  resolved: ResolvedModel<V>;
  maxRetries: number;
}): Promise<ConversationResult> {
  const { options, resolved, maxRetries } = args;
  const start = performance.now();

  const provider = resolved.provider as unknown as SpeechGatewayProvider;
  const modelLabel = `${provider.id}/${resolved.modelId}`;

  // The conversation endpoint returns raw mixed audio only — no per-turn
  // alignment on the wire today. When `timestamps: "on"` is requested, the
  // SDK runs STT over the mixed audio and attributes each word back to a
  // turn via text-matching. This mirrors what `/v1/audio/conversation/with-
  // timestamps` will do server-side once it ships; at that point the SDK
  // switches to hitting that endpoint and this local fallback goes away.
  const requestedMode: TimestampMode = options.timestamps ?? "off";
  const sttFallbackNeeded = requestedMode === "on";

  // Each turn's voice must be a string over the wire. Object-shaped voices
  // (URL / inline audio) aren't supported by the gateway conversation path
  // today.
  const wireTurns = options.turns.map((t, i) => {
    if (typeof t.voice !== "string") {
      throw new Error(
        `${modelLabel}: gateway conversation path requires string voices; turns[${i}].voice is an object.`
      );
    }
    return {
      voice: t.voice,
      text: t.text,
      ...(t.providerOptions && { providerOptions: t.providerOptions }),
    };
  });

  const result = await pRetry(
    () =>
      provider.generateConversation({
        modelId: resolved.modelId,
        turns: wireTurns,
        gapMs: options.gapMs ?? DEFAULT_GAP_MS,
        volumeDbfs: options.volumeDbfs,
        normalizeVolume: options.normalizeVolume,
        providerOptions: options.providerOptions,
        abortSignal: options.abortSignal,
        headers: options.headers,
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

  // Resolve timestamps:
  //   - "off"  → undefined
  //   - "on"   → STT over mixed audio + text-match-attribute to turns[]
  let timestamps: readonly ConversationWordTimestamp[] | undefined;
  if (sttFallbackNeeded) {
    const derived = await deriveTimestampsViaSTT({
      ttsModel: modelLabel,
      audio: audio.uint8Array,
      mediaType: result.mediaType,
      timestampProvider: options.timestampProvider,
      abortSignal: options.abortSignal,
    });
    timestamps = attributeTimestampsToTurns({
      timestamps: derived,
      turns: options.turns,
      modelId: modelLabel,
    });
  }

  const inputChars = options.turns.reduce((n, t) => n + t.text.length, 0);

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars,
    provider: provider.id,
    model: resolved.modelId,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  // Rebuild per-turn attribution from caller input: the gateway's conversation
  // endpoint no longer carries it on the wire (server-side only in
  // `speech_requests`). The model id is `<provider>/<model>` on the gateway
  // path, so split it for the public shape.
  const slashIdx = resolved.modelId.indexOf("/");
  const wireProvider =
    slashIdx === -1 ? resolved.modelId : resolved.modelId.slice(0, slashIdx);
  const wireModel =
    slashIdx === -1 ? resolved.modelId : resolved.modelId.slice(slashIdx + 1);
  const perTurn = wireTurns.map((t) => ({
    provider: wireProvider,
    model: wireModel,
    voice: t.voice,
  }));

  return {
    audio,
    metadata,
    providerMetadata: { turns: perTurn },
    timestamps,
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

  // When normalization is requested and the provider exposes a decodable
  // PCM/WAV mode via getStitchOptions, force the dialogue request into that
  // mode so we can re-RMS-level the output. Otherwise the dialogue runs
  // unchanged and emerges in whatever format the provider mixes natively
  // (often MP3) — we surface that via a warning.
  const normalize = options.normalizeVolume ?? true;
  const stitchOpts = normalize
    ? resolved.provider.getStitchOptions?.(resolved.modelId)
    : undefined;
  const warnings: string[] = [];
  if (normalize && !stitchOpts) {
    warnings.push(
      `${resolved.provider.id}/${resolved.modelId}: native dialogue path returns the provider's mixed audio without volume normalization. Pass normalizeVolume:false to silence this warning.`
    );
  }

  // Stitch-mode options are applied last so they override user-supplied
  // providerOptions that would otherwise break the decoder (e.g. a caller
  // requesting `response_format: "mp3"` while normalization is on). Same
  // precedence as the stitch path's per-turn merge.
  const dialogueProviderOptions = stitchOpts
    ? { ...options.providerOptions, ...stitchOpts.providerOptions }
    : options.providerOptions;

  const timestampMode = options.timestamps ?? "off";
  const hasNativeDialogueTimestamps = modelDeclaresNativeTimestamps(resolved);
  const shouldRequestNative =
    timestampMode === "on" && hasNativeDialogueTimestamps;

  const dialogueId = `${resolved.provider.id}/${resolved.modelId}`;
  if (timestampMode === "off") {
    debug(`${dialogueId} (dialogue): timestamps: "off" — skipping alignment.`);
  } else if (shouldRequestNative) {
    debug(
      `${dialogueId} (dialogue): timestamps: "on" — requesting native dialogue alignment.`
    );
  } else {
    debug(
      `${dialogueId} (dialogue): timestamps: "on" but no native dialogue alignment — will transcribe mixed audio via STT after rendering (adds a round-trip).`
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
  // Prefer the stitch-mode mediaType over the provider's response header;
  // some providers (e.g. Hume) omit the sample rate from content-type.
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

  const timestamps = await resolveNativeDialogueTimestamps({
    timestampMode,
    nativeTimestamps: result.timestamps,
    audio: audio.uint8Array,
    mediaType: outputMediaType,
    ttsModel: `${resolved.provider.id}/${resolved.modelId}`,
    timestampProvider: options.timestampProvider,
    abortSignal: options.abortSignal,
    turns: options.turns,
  });

  const inputChars = options.turns.reduce((n, t) => n + t.text.length, 0);

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars,
    provider: resolved.provider.id,
    model: resolved.modelId,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: warnings.length > 0 ? warnings : undefined,
    timestamps,
  };
}

// Resolves timestamps for the native dialogue path:
//   - "off"                       → undefined
//   - native alignment returned   → attribute words to turns and pass through
//   - "on" without native         → STT fallback, then attribute to turns
//
// On both alignment-bearing branches the flat word list is split back across
// `turns[]` by greedy text-matching (case-insensitive, punctuation-insensitive)
// against the input transcripts. If matching diverges
// (`ConversationTimestampAttributionError`), we surface it loudly rather than
// silently emit a wrong `turnIndex`.
async function resolveNativeDialogueTimestamps<V extends Voice>(args: {
  timestampMode: TimestampMode;
  nativeTimestamps: readonly WordTimestamp[] | undefined;
  audio: Uint8Array;
  mediaType: string;
  ttsModel: string;
  timestampProvider: ResolvedSTTModel | undefined;
  abortSignal: AbortSignal | undefined;
  turns: readonly ConversationTurn<V>[];
}): Promise<readonly ConversationWordTimestamp[] | undefined> {
  if (args.timestampMode === "off") {
    return;
  }
  if (args.nativeTimestamps && args.nativeTimestamps.length > 0) {
    return attributeTimestampsToTurns({
      timestamps: args.nativeTimestamps,
      turns: args.turns,
      modelId: args.ttsModel,
    });
  }
  const derived = await deriveTimestampsViaSTT({
    ttsModel: args.ttsModel,
    audio: args.audio,
    mediaType: args.mediaType,
    timestampProvider: args.timestampProvider,
    abortSignal: args.abortSignal,
  });
  return attributeTimestampsToTurns({
    timestamps: derived,
    turns: args.turns,
    modelId: args.ttsModel,
  });
}

/**
 * Normalize a word for matching: lowercase + strip leading/trailing
 * punctuation. Keeps internal apostrophes, hyphens, etc. so contractions and
 * hyphenated words match across providers ("don't" ↔ "don't.").
 */
function normalizeWord(s: string): string {
  // Strip leading/trailing characters that aren't letters, digits, apostrophes,
  // or hyphens. Internal punctuation is preserved.
  return s
    .toLowerCase()
    .replace(NORMALIZE_LEAD_RE, "")
    .replace(NORMALIZE_TRAIL_RE, "");
}

/** Split a turn's text into match-tokens (word forms used for attribution). */
function tokenizeTurn(text: string): string[] {
  return text
    .split(WHITESPACE_SPLIT_RE)
    .map(normalizeWord)
    .filter((t) => t.length > 0);
}

/**
 * Attribute a flat list of provider word timestamps back to the `turns[]`
 * they came from by greedy text-matching. Walks the timestamps in order,
 * consuming words from `turns[0]` first, advancing to the next turn when
 * the current turn's tokens are exhausted.
 *
 * Throws `ConversationTimestampAttributionError` when (a) a timestamp word
 * doesn't match the next expected turn token (with a small slack budget for
 * provider drift), (b) timestamps run out before all turns are consumed, or
 * (c) all turns are consumed before timestamps are exhausted.
 */
function attributeTimestampsToTurns<V extends Voice>(args: {
  timestamps: readonly WordTimestamp[];
  turns: readonly ConversationTurn<V>[];
  modelId: string;
}): readonly ConversationWordTimestamp[] {
  const { timestamps, turns, modelId } = args;
  const turnTokens = turns.map((t) => tokenizeTurn(t.text));
  const totalExpected = turnTokens.reduce((n, t) => n + t.length, 0);

  // Allow up to 20% mismatched words across the whole transcript before we
  // bail. Keeps minor TTS quirks (e.g. "okay" → "OK") from blowing up an
  // otherwise-correct attribution.
  const maxMismatches = Math.max(1, Math.floor(timestamps.length * 0.2));

  const out: ConversationWordTimestamp[] = [];
  let turnIndex = 0;
  let tokenIndex = 0;
  let mismatches = 0;

  for (const ts of timestamps) {
    const observed = normalizeWord(ts.text);

    // Skip empty/whitespace-only words from the provider — they carry no
    // attribution signal.
    if (observed.length === 0) {
      out.push({
        text: ts.text,
        start: ts.start,
        end: ts.end,
        turnIndex: Math.min(turnIndex, turns.length - 1),
      });
      continue;
    }

    // Advance past any turns whose tokens are exhausted.
    while (
      turnIndex < turnTokens.length &&
      tokenIndex >= (turnTokens[turnIndex]?.length ?? 0)
    ) {
      turnIndex++;
      tokenIndex = 0;
    }

    if (turnIndex >= turnTokens.length) {
      throw new ConversationTimestampAttributionError({
        turnIndex: turns.length - 1,
        observed: ts.text,
        expected: "<end of conversation>",
        modelId,
      });
    }

    const expected = turnTokens[turnIndex]?.[tokenIndex] ?? "";

    if (observed === expected) {
      out.push({
        text: ts.text,
        start: ts.start,
        end: ts.end,
        turnIndex,
      });
      tokenIndex++;
      continue;
    }

    // Mismatch: tolerate up to `maxMismatches` total. Attribute to the
    // current turn (best guess) and advance our token cursor so we don't
    // get permanently stuck on a single bad word.
    mismatches++;
    if (mismatches > maxMismatches) {
      throw new ConversationTimestampAttributionError({
        turnIndex,
        observed: ts.text,
        expected: turnTokens[turnIndex]?.[tokenIndex] ?? "",
        modelId,
      });
    }
    out.push({
      text: ts.text,
      start: ts.start,
      end: ts.end,
      turnIndex,
    });
    tokenIndex++;
  }

  // Verify we consumed at least most of the expected words. If we ended
  // far short of the input transcript, attribution probably skipped an
  // entire turn.
  const consumedExpected =
    turnTokens.slice(0, turnIndex).reduce((n, t) => n + t.length, 0) +
    tokenIndex;
  if (totalExpected > 0 && consumedExpected < Math.floor(totalExpected * 0.8)) {
    throw new ConversationTimestampAttributionError({
      turnIndex,
      observed: "<end of timestamps>",
      expected: turnTokens[turnIndex]?.[tokenIndex] ?? "<more words>",
      modelId,
    });
  }

  return out;
}
