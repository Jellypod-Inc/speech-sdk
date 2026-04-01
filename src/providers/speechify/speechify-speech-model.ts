import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface SpeechifySpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class SpeechifySpeechProvider implements SpeechProvider<string, string> {
  readonly id = 'speechify';
  readonly defaultModel = 'simba-multilingual';

  readonly models = [
    { id: 'simba-multilingual', languages: ['en'] },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: SpeechifySpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.speechify.ai/v1';
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
    const url = `${this.baseURL}/audio/speech`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      model: options.modelId,
      input: options.text,
      voice_id: options.voice,
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resolveApiKey(this.apiKey, 'SPEECHIFY_API_KEY', 'Speechify')}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `speechify/${options.modelId}`);

    const json = await response.json() as { audio_data: string };

    return {
      audio: json.audio_data,
      mediaType: 'audio/mpeg',
    };
  }
}
