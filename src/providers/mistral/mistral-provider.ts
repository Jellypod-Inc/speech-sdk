import { MistralSpeechProvider, type MistralSpeechProviderConfig } from './mistral-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createMistral(config: MistralSpeechProviderConfig = {}) {
  const provider = new MistralSpeechProvider(config);
  return function mistral(modelId?: string): ResolvedModel<string | { audio: string | Uint8Array }> {
    return { provider, modelId: modelId ?? provider.defaultModel };
  };
}
