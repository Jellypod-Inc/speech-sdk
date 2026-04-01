import { CartesiaSpeechProvider, type CartesiaSpeechProviderConfig } from './cartesia-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createCartesia(config: CartesiaSpeechProviderConfig = {}) {
  const provider = new CartesiaSpeechProvider(config);

  return function cartesia(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
