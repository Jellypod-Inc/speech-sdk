import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { chooseConversationPath } from "./conversation/dispatch.js";
import { ConversationInputError } from "./conversation/errors.js";
import type { GenerateConversationOptions } from "./conversation/types.js";
import { validateConversationInput } from "./conversation/validate.js";
import { ApiError, NoSpeechGeneratedError } from "./errors.js";
import type { SpeechMetadata } from "./metadata.js";
import { resolveModel } from "./resolve-provider.js";
import type { ResolvedModel, Voice } from "./speech-provider.js";
import type { SpeechResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";

export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";

const DEFAULT_GAP_MS = 300;
const DEFAULT_MAX_CONCURRENCY = 6;
const DEFAULT_MAX_RETRIES = 2;

export async function generateConversation<V extends Voice = Voice>(
  options: GenerateConversationOptions<V>
): Promise<SpeechResult> {
  validateConversationInput(options);

  const resolvedPerTurn: ResolvedModel<V>[] = options.turns.map((turn) => {
    const model = turn.model ?? options.model;
    if (!model) {
      throw new Error("generateConversation: model is required");
    }
    return resolveModel(model, { apiKey: options.apiKey }) as ResolvedModel<V>;
  });

  const path = chooseConversationPath({
    resolvedPerTurn,
    turns: options.turns,
  });

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
  };
}

async function runNative<V extends Voice>(args: {
  options: GenerateConversationOptions<V>;
  resolved: ResolvedModel<V>;
  maxRetries: number;
}): Promise<SpeechResult> {
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

  const result = await pRetry(
    () =>
      generateDialogue({
        modelId: resolved.modelId,
        turns: options.turns.map((t) => ({ voice: t.voice, text: t.text })),
        providerOptions: dialogueProviderOptions,
        abortSignal: options.abortSignal,
        headers: options.headers,
      }),
    {
      retries: maxRetries,
      signal: options.abortSignal,
      shouldRetry: ({ error }) => {
        if (error instanceof ApiError && error.statusCode < 500) {
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
  };
}
