import { DeepgramSpeechProvider, type DeepgramSpeechProviderConfig } from './deepgram-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createDeepgram(config: DeepgramSpeechProviderConfig = {}) {
  const provider = new DeepgramSpeechProvider(config);

  return function deepgram(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
