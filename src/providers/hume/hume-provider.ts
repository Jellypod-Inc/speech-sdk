import { HumeSpeechProvider, type HumeSpeechProviderConfig } from './hume-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createHume(config: HumeSpeechProviderConfig = {}) {
  const provider = new HumeSpeechProvider(config);

  return function hume(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
