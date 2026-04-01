import { WellSaidSpeechProvider, type WellSaidSpeechProviderConfig } from './wellsaid-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createWellSaid(config: WellSaidSpeechProviderConfig = {}) {
  const provider = new WellSaidSpeechProvider(config);

  return function wellsaid(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
