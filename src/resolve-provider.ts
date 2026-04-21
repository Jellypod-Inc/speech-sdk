import { SpeechSDKError } from "./errors.js";
import { parseProviderModelSpec } from "./provider-utils.js";
import { CartesiaSpeechProvider } from "./providers/cartesia/index.js";
import { DeepgramSpeechProvider } from "./providers/deepgram/index.js";
import { ElevenLabsSpeechProvider } from "./providers/elevenlabs/index.js";
import { FalSpeechProvider } from "./providers/fal/index.js";
import { FishAudioSpeechProvider } from "./providers/fish-audio/index.js";
import { GoogleSpeechProvider } from "./providers/google/index.js";
import { HumeSpeechProvider } from "./providers/hume/index.js";
import { InworldSpeechProvider } from "./providers/inworld/index.js";
import { MistralSpeechProvider } from "./providers/mistral/index.js";
import { MurfSpeechProvider } from "./providers/murf/index.js";
import { OpenAISpeechProvider } from "./providers/openai/index.js";
import { ResembleSpeechProvider } from "./providers/resemble/index.js";
import { XaiSpeechProvider } from "./providers/xai/index.js";
import type { ResolvedModel, SpeechProvider } from "./speech-provider.js";

function isResolvedModel(model: unknown): model is ResolvedModel {
  return (
    model != null &&
    typeof model === "object" &&
    "provider" in model &&
    "modelId" in model
  );
}

function createBuiltinProvider(
  name: string,
  options?: { apiKey?: string }
): SpeechProvider {
  const config = options?.apiKey ? { apiKey: options.apiKey } : {};
  switch (name) {
    case "openai":
      return new OpenAISpeechProvider(config);
    case "elevenlabs":
      return new ElevenLabsSpeechProvider(config);
    case "deepgram":
      return new DeepgramSpeechProvider(config);
    case "cartesia":
      return new CartesiaSpeechProvider(config);
    case "hume":
      return new HumeSpeechProvider(config);
    case "inworld":
      return new InworldSpeechProvider(config);
    case "google":
      return new GoogleSpeechProvider(config);
    case "fish-audio":
      return new FishAudioSpeechProvider(config);
    case "murf":
      return new MurfSpeechProvider(config);
    case "resemble":
      return new ResembleSpeechProvider(config);
    case "fal-ai":
      return new FalSpeechProvider(config);
    case "mistral":
      return new MistralSpeechProvider(config);
    case "xai":
      return new XaiSpeechProvider(config);
    default:
      throw new SpeechSDKError(`Unknown provider: ${name}`);
  }
}

export function resolveModel(
  model: string | ResolvedModel,
  options?: { apiKey?: string }
): ResolvedModel {
  if (isResolvedModel(model)) {
    return model;
  }

  const { providerName, modelId } = parseProviderModelSpec(model);
  const provider = createBuiltinProvider(providerName, options);
  return {
    provider,
    modelId: modelId ?? provider.defaultModel,
  };
}
