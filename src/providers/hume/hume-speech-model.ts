import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface HumeSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class HumeSpeechProvider implements SpeechProvider<string, string> {
  readonly id = 'hume';
  readonly defaultModel = 'octave-2';

  readonly models = [
    { id: 'octave-2', languages: ['en'] as const },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: HumeSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.hume.ai/v0';
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
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const utterance: Record<string, unknown> = { text: options.text };
    if (options.voice) {
      utterance.voice = { name: options.voice };
    }

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      utterances: [utterance],
    };

    const url = `${this.baseURL}/tts/file`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hume-Api-Key': resolveApiKey(this.apiKey, 'HUME_API_KEY', 'Hume'),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `hume/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get('content-type') ?? 'audio/mpeg';

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }
}
