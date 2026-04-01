import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface MistralSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class MistralSpeechProvider
  implements SpeechProvider<string, string | { audio: string | Uint8Array }>
{
  readonly id = 'mistral';
  readonly defaultModel = 'voxtral-mini-tts-2603';
  readonly models = [
    { id: 'voxtral-mini-tts-2603', languages: ['en'] as const },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MistralSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.mistral.ai/v1';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string | { audio: string | Uint8Array };
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string;
    mediaType: string;
  }> {
    const body: Record<string, unknown> = {
      response_format: 'mp3',
      ...options.providerOptions,
      model: options.modelId,
      input: options.text,
    };

    if (options.voice != null) {
      if (typeof options.voice === 'string') {
        body.voice_id = options.voice;
      } else if ('audio' in options.voice) {
        const audio = options.voice.audio;
        if (audio instanceof Uint8Array) {
          let binaryString = '';
          for (let i = 0; i < audio.length; i++) {
            binaryString += String.fromCharCode(audio[i]);
          }
          body.ref_audio = btoa(binaryString);
        } else {
          body.ref_audio = audio;
        }
      }
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resolveApiKey(this.apiKey, 'MISTRAL_API_KEY', 'Mistral')}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `mistral/${options.modelId}`);

    const json = await response.json() as { audio_data: string };

    return {
      audio: json.audio_data,
      mediaType: 'audio/mpeg',
    };
  }
}
