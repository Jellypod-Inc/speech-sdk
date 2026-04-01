import { OpenAISpeechProvider, type OpenAISpeechProviderConfig } from './openai-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createOpenAI(config: OpenAISpeechProviderConfig = {}) {
  const provider = new OpenAISpeechProvider(config);

  return function openai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
