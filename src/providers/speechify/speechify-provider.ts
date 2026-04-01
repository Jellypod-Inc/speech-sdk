import { SpeechifySpeechProvider, type SpeechifySpeechProviderConfig } from './speechify-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createSpeechify(config: SpeechifySpeechProviderConfig = {}) {
  const provider = new SpeechifySpeechProvider(config);

  return function speechify(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
