import { GoogleSpeechProvider, type GoogleSpeechProviderConfig } from './google-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createGoogle(config: GoogleSpeechProviderConfig = {}) {
  const provider = new GoogleSpeechProvider(config);

  return function google(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
