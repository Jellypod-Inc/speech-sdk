import type { OpenAISpeechOptions } from './providers/openai/openai-options.js';
import type { ElevenLabsSpeechOptions } from './providers/elevenlabs/elevenlabs-options.js';
import type { ResolvedModel } from './speech-provider.js';

export interface ProviderRegistry {
  openai: {
    model: 'tts-1' | 'tts-1-hd' | 'gpt-4o-mini-tts' | (string & {});
    options: OpenAISpeechOptions;
  };
  elevenlabs: {
    model:
      | 'eleven_multilingual_v2'
      | 'eleven_flash_v2_5'
      | 'eleven_flash_v2'
      | 'eleven_turbo_v2_5'
      | 'eleven_turbo_v2'
      | 'eleven_monolingual_v1'
      | 'eleven_multilingual_v1'
      | (string & {});
    options: ElevenLabsSpeechOptions;
  };
}

export type GenerateSpeechOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  model: string | ResolvedModel<T>;
  text: string;
  voice: string;
  providerOptions?: T;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
};
