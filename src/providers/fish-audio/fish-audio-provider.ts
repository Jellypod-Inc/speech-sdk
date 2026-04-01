import { FishAudioSpeechProvider, type FishAudioSpeechProviderConfig } from './fish-audio-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createFishAudio(config: FishAudioSpeechProviderConfig = {}) {
  const provider = new FishAudioSpeechProvider(config);

  return function fishAudio(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
