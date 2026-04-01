import { MurfSpeechProvider, type MurfSpeechProviderConfig } from './murf-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createMurf(config: MurfSpeechProviderConfig = {}) {
  const provider = new MurfSpeechProvider(config);

  return function murf(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
