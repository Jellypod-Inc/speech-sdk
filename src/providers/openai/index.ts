import type { SpeechProvider, ResolvedModel } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface OpenAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class OpenAISpeechProvider implements SpeechProvider<string, string> {
  readonly id = 'openai';
  readonly defaultModel = 'gpt-4o-mini-tts';

  private static readonly LANGUAGES = [
    'af', 'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de',
    'el', 'en', 'es', 'et', 'fi', 'fr', 'gl', 'gu', 'he', 'hi',
    'hr', 'hu', 'id', 'is', 'it', 'ja', 'jv', 'ka', 'kk', 'km',
    'kn', 'ko', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms',
    'my', 'ne', 'nl', 'no', 'pa', 'pl', 'pt', 'ro', 'ru', 'si',
    'sk', 'sl', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te',
    'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh',
  ] as const;

  readonly models = [
    { id: 'gpt-4o-mini-tts', languages: OpenAISpeechProvider.LANGUAGES },
    { id: 'tts-1', languages: OpenAISpeechProvider.LANGUAGES },
    { id: 'tts-1-hd', languages: OpenAISpeechProvider.LANGUAGES },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.openai.com/v1';
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
    const body: Record<string, unknown> = {
      ...options.providerOptions,
      model: options.modelId,
      input: options.text,
      voice: options.voice,
    };

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resolveApiKey(this.apiKey, 'OPENAI_API_KEY', 'OpenAI')}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `openai/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get('content-type') ?? 'audio/mpeg';

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }
}

export function createOpenAI(config: OpenAISpeechProviderConfig = {}) {
  const provider = new OpenAISpeechProvider(config);

  return function openai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
