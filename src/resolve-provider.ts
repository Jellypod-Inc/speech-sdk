import {
  CARTESIA_PROVIDER_ID,
  createCartesia,
} from "./providers/cartesia/index.js";
import {
  createDeepgram,
  DEEPGRAM_PROVIDER_ID,
} from "./providers/deepgram/index.js";
import {
  createElevenLabs,
  ELEVENLABS_PROVIDER_ID,
} from "./providers/elevenlabs/index.js";
import { createFal, FAL_PROVIDER_ID } from "./providers/fal/index.js";
import {
  createFishAudio,
  FISH_AUDIO_PROVIDER_ID,
} from "./providers/fish-audio/index.js";
import { createGoogle, GOOGLE_PROVIDER_ID } from "./providers/google/index.js";
import {
  createGradium,
  GRADIUM_PROVIDER_ID,
} from "./providers/gradium/index.js";
import { createHume, HUME_PROVIDER_ID } from "./providers/hume/index.js";
import {
  createInworld,
  INWORLD_PROVIDER_ID,
} from "./providers/inworld/index.js";
import {
  createMiniMax,
  MINIMAX_PROVIDER_ID,
} from "./providers/minimax/index.js";
import {
  createMistral,
  MISTRAL_PROVIDER_ID,
} from "./providers/mistral/index.js";
import { createMurf, MURF_PROVIDER_ID } from "./providers/murf/index.js";
import { createOpenAI, OPENAI_PROVIDER_ID } from "./providers/openai/index.js";
import {
  createResemble,
  RESEMBLE_PROVIDER_ID,
} from "./providers/resemble/index.js";
import {
  createSmallestAI,
  SMALLEST_AI_PROVIDER_ID,
} from "./providers/smallest-ai/index.js";
import {
  createSpeechify,
  SPEECHIFY_PROVIDER_ID,
} from "./providers/speechify/index.js";
import { createXai, XAI_PROVIDER_ID } from "./providers/xai/index.js";
import type { ResolvedModel } from "./speech-provider.js";

type ProviderFactory = (config: {
  apiKey?: string;
}) => (modelId?: string) => ResolvedModel<string>;

const PROVIDER_FACTORIES: Record<string, ProviderFactory> = {
  [CARTESIA_PROVIDER_ID]: createCartesia,
  [DEEPGRAM_PROVIDER_ID]: createDeepgram,
  [ELEVENLABS_PROVIDER_ID]: createElevenLabs,
  [FAL_PROVIDER_ID]: createFal,
  [FISH_AUDIO_PROVIDER_ID]: createFishAudio,
  [GOOGLE_PROVIDER_ID]: createGoogle,
  [GRADIUM_PROVIDER_ID]: createGradium,
  [HUME_PROVIDER_ID]: createHume,
  [INWORLD_PROVIDER_ID]: createInworld,
  [MINIMAX_PROVIDER_ID]: createMiniMax,
  [MISTRAL_PROVIDER_ID]: createMistral,
  [MURF_PROVIDER_ID]: createMurf,
  [OPENAI_PROVIDER_ID]: createOpenAI,
  [RESEMBLE_PROVIDER_ID]: createResemble,
  [SMALLEST_AI_PROVIDER_ID]: createSmallestAI,
  [SPEECHIFY_PROVIDER_ID]: createSpeechify,
  [XAI_PROVIDER_ID]: createXai,
};

export const SUPPORTED_PROVIDER_IDS: readonly string[] =
  Object.keys(PROVIDER_FACTORIES).sort();

function isResolvedModel(model: unknown): model is ResolvedModel {
  return (
    model != null &&
    typeof model === "object" &&
    "provider" in model &&
    "modelId" in model
  );
}

export function resolveModel(
  model: string | ResolvedModel,
  options?: { apiKey?: string }
): ResolvedModel {
  if (isResolvedModel(model)) {
    return model;
  }

  if (!model) {
    throw new Error(
      'A model is required. Pass a "provider/model" string (e.g., "openai/gpt-4o-mini-tts") or a ResolvedModel from a factory like createOpenAI()().'
    );
  }

  const separator = model.indexOf("/");
  const providerId = separator === -1 ? model : model.slice(0, separator);
  const modelId = separator === -1 ? undefined : model.slice(separator + 1);

  const create = PROVIDER_FACTORIES[providerId];
  if (!create) {
    throw new Error(
      `Unknown provider "${providerId}" in model string "${model}". Supported providers: ${SUPPORTED_PROVIDER_IDS.join(", ")}.`
    );
  }

  const config = options?.apiKey ? { apiKey: options.apiKey } : {};
  const resolved = create(config)(modelId || undefined);
  if (!resolved.modelId) {
    throw new Error(
      `Provider "${providerId}" has no default model. Pass a full "provider/model" string (e.g., "${providerId}/<model-id>").`
    );
  }
  return resolved;
}
