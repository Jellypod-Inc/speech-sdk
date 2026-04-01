import { ResembleSpeechProvider, type ResembleSpeechProviderConfig } from './resemble-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createResemble(config: ResembleSpeechProviderConfig = {}) {
  const provider = new ResembleSpeechProvider(config);

  return function resemble(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
