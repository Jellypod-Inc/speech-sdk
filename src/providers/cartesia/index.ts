import type { SpeechProvider, ResolvedModel } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface CartesiaSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class CartesiaSpeechProvider implements SpeechProvider<string, string> {
  readonly id = 'cartesia';
  readonly defaultModel = 'sonic-3';

  readonly models = [
    { id: 'sonic-3', languages: ['en', 'fr', 'de', 'es', 'pt', 'zh', 'ja', 'hi', 'it', 'ko', 'nl', 'pl', 'ru', 'sv', 'tr'] },
    { id: 'sonic-2', languages: ['en'] },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: CartesiaSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.cartesia.ai';
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
    const url = `${this.baseURL}/tts/bytes`;

    const body: Record<string, unknown> = {
      output_format: {
        container: 'wav',
        encoding: 'pcm_f32le',
        sample_rate: 44100,
      },
      ...options.providerOptions,
      model_id: options.modelId,
      transcript: options.text,
      voice: { mode: 'id', id: options.voice },
    };

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': resolveApiKey(this.apiKey, 'CARTESIA_API_KEY', 'Cartesia'),
        'Cartesia-Version': '2025-04-16',
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `cartesia/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get('content-type') ?? 'audio/mpeg';

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }
}

export function createCartesia(config: CartesiaSpeechProviderConfig = {}) {
  const provider = new CartesiaSpeechProvider(config);

  return function cartesia(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
