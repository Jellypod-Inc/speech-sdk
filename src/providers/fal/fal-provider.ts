import { FalSpeechProvider, type FalSpeechProviderConfig } from './fal-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createFal(config: FalSpeechProviderConfig = {}) {
  const provider = new FalSpeechProvider(config);

  return function fal(modelId?: string): ResolvedModel<string | { url: string }> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
