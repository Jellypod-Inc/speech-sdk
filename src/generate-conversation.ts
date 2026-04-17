import { computeAudioDuration } from "./audio-duration.js";
import { chooseConversationPath } from "./conversation/dispatch.js";
import { runStitch } from "./conversation/stitch.js";
import type { GenerateConversationOptions } from "./conversation/types.js";
import { validateConversationInput } from "./conversation/validate.js";
import { NoSpeechGeneratedError } from "./errors.js";
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
    if (model == null) {
      // Unreachable — validate guarantees at least one of the two is set.
      throw new Error("generateConversation: model is required");
    }
    return resolveModel(model as string | ResolvedModel<V>, {
      apiKey: options.apiKey,
    }) as ResolvedModel<V>;
  });

  const path = chooseConversationPath({
    resolvedPerTurn,
    turns: options.turns,
  });

  if (path.kind === "native") {
    return await runNative({
      options,
      resolved: { provider: path.provider, modelId: path.modelId },
    });
  }

  const stitched = await runStitch({
    resolvedPerTurn,
    turns: options.turns,
    stitchOptionsPerTurn: path.stitchOptionsPerTurn,
    topLevelProviderOptions: options.providerOptions,
    apiKey: options.apiKey,
    gapMs: options.gapMs ?? DEFAULT_GAP_MS,
    maxConcurrency: options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
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
  resolved: { provider: ResolvedModel<V>["provider"]; modelId: string };
}): Promise<SpeechResult> {
  const { options, resolved } = args;
  const start = performance.now();

  // generateDialogue guaranteed present by dispatch.
  if (!resolved.provider.generateDialogue) {
    throw new Error(
      `generateConversation: ${resolved.provider.id}/${resolved.modelId} dispatched to native but generateDialogue missing`
    );
  }

  const result = await resolved.provider.generateDialogue({
    modelId: resolved.modelId,
    turns: options.turns.map((t) => ({ voice: t.voice, text: t.text })),
    providerOptions: options.providerOptions,
    abortSignal: options.abortSignal,
    headers: options.headers,
  });

  const latencyMs = Math.round(performance.now() - start);

  if (result.audio.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const audio = new DefaultGeneratedAudioFile({
    data: result.audio,
    mediaType: result.mediaType,
  });

  const computedDuration = await computeAudioDuration(
    result.audio,
    result.mediaType
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
  };
}
