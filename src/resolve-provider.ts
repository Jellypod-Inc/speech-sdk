import type { SpeechProvider, ResolvedModel } from './speech-provider.js';
import { SpeechSDKError } from './errors.js';
import { OpenAISpeechProvider } from './providers/openai/openai-speech-model.js';
import { ElevenLabsSpeechProvider } from './providers/elevenlabs/elevenlabs-speech-model.js';

function isResolvedModel(model: unknown): model is ResolvedModel {
  return (
    model != null &&
    typeof model === 'object' &&
    'provider' in model &&
    'modelId' in model
  );
}

function createBuiltinProvider(name: string): SpeechProvider {
  switch (name) {
    case 'openai':
      return new OpenAISpeechProvider({});
    case 'elevenlabs':
      return new ElevenLabsSpeechProvider({});
    default:
      throw new SpeechSDKError(`Unknown provider: ${name}`);
  }
}

export function resolveModel(
  model: string | ResolvedModel,
): ResolvedModel {
  if (isResolvedModel(model)) {
    return model;
  }

  const slashIndex = model.indexOf('/');
  let providerName: string;
  let modelId: string | undefined;

  if (slashIndex !== -1) {
    providerName = model.slice(0, slashIndex);
    modelId = model.slice(slashIndex + 1);
  } else {
    providerName = model;
    modelId = undefined;
  }

  const provider = createBuiltinProvider(providerName);
  return {
    provider,
    modelId: modelId ?? provider.defaultModel,
  };
}
