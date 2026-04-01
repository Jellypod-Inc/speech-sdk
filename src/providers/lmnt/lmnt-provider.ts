import { LMNTSpeechProvider, type LMNTSpeechProviderConfig } from './lmnt-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createLMNT(config: LMNTSpeechProviderConfig = {}) {
  const provider = new LMNTSpeechProvider(config);

  return function lmnt(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
