import { UnrealSpeechProvider, type UnrealSpeechProviderConfig } from './unreal-speech-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createUnrealSpeech(config: UnrealSpeechProviderConfig = {}) {
  const provider = new UnrealSpeechProvider(config);

  return function unrealSpeech(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
