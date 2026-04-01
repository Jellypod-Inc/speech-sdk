import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface MurfSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class MurfSpeechProvider implements SpeechProvider<string, string> {
  readonly id = 'murf';
  readonly defaultModel = 'GEN2';

  readonly models = [
    { id: 'GEN2', languages: ['en'] },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MurfSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.murf.ai/v1';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const url = `${this.baseURL}/speech/generate`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      voiceId: options.voice,
      text: options.text,
      encodeAsBase64: true,
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': resolveApiKey(this.apiKey, 'MURF_API_KEY', 'Murf'),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `murf/${options.modelId}`);

    const json = await response.json() as { encodedAudio: string };

    return {
      audio: json.encodedAudio,
      mediaType: 'audio/wav',
    };
  }
}
