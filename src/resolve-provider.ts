import type { SpeechProvider, ResolvedModel } from './speech-provider.js';
import { SpeechSDKError } from './errors.js';
import { OpenAISpeechProvider } from './providers/openai/index.js';
import { ElevenLabsSpeechProvider } from './providers/elevenlabs/index.js';
import { DeepgramSpeechProvider } from './providers/deepgram/index.js';
import { CartesiaSpeechProvider } from './providers/cartesia/index.js';
import { HumeSpeechProvider } from './providers/hume/index.js';
import { GoogleSpeechProvider } from './providers/google/index.js';
import { FishAudioSpeechProvider } from './providers/fish-audio/index.js';
import { UnrealSpeechProvider } from './providers/unreal-speech/index.js';
import { MurfSpeechProvider } from './providers/murf/murf-speech-model.js';
import { ResembleSpeechProvider } from './providers/resemble/resemble-speech-model.js';
import { FalSpeechProvider } from './providers/fal/fal-speech-model.js';
import { MistralSpeechProvider } from './providers/mistral/mistral-speech-model.js';

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
    case 'deepgram':
      return new DeepgramSpeechProvider({});
    case 'cartesia':
      return new CartesiaSpeechProvider({});
case 'hume':
      return new HumeSpeechProvider({});
    case 'google':
      return new GoogleSpeechProvider({});
case 'fish-audio':
      return new FishAudioSpeechProvider({});
    case 'unreal-speech':
      return new UnrealSpeechProvider({});
    case 'murf':
      return new MurfSpeechProvider({});
    case 'resemble':
      return new ResembleSpeechProvider({});
case 'fal-ai':
      return new FalSpeechProvider({});
    case 'mistral':
      return new MistralSpeechProvider({});
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
    modelId: modelId || provider.defaultModel,
  };
}
