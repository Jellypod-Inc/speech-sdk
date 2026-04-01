import {
  ElevenLabsSpeechProvider,
  type ElevenLabsSpeechProviderConfig,
} from './elevenlabs-speech-model.js';
import type { ResolvedModel } from '../../speech-provider.js';

export function createElevenLabs(config: ElevenLabsSpeechProviderConfig = {}) {
  const provider = new ElevenLabsSpeechProvider(config);

  return function elevenlabs(
    modelId?: string,
  ): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
