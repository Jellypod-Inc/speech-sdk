import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';
import { openaiSpeechOptionsSchema, type OpenAISpeechOptions } from './openai-options.js';

export interface OpenAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class OpenAISpeechProvider implements SpeechProvider<string, OpenAISpeechOptions> {
  readonly id = 'openai';
  readonly defaultModel = 'gpt-4o-mini-tts';
  readonly supportedLanguages = [
    'af', 'ar', 'bg', 'bn', 'bs', 'ca', 'cs', 'cy', 'da', 'de',
    'el', 'en', 'es', 'et', 'fi', 'fr', 'gl', 'gu', 'he', 'hi',
    'hr', 'hu', 'id', 'is', 'it', 'ja', 'jw', 'ka', 'kk', 'km',
    'kn', 'ko', 'lo', 'lt', 'lv', 'mk', 'ml', 'mn', 'mr', 'ms',
    'my', 'ne', 'nl', 'no', 'pa', 'pl', 'pt', 'ro', 'ru', 'si',
    'sk', 'sl', 'so', 'sq', 'sr', 'su', 'sv', 'sw', 'ta', 'te',
    'th', 'tl', 'tr', 'uk', 'ur', 'vi', 'zh',
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
    providerOptions?: OpenAISpeechOptions;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const parsed = options.providerOptions
      ? openaiSpeechOptionsSchema.parse(options.providerOptions)
      : {};

    const body: Record<string, unknown> = {
      model: options.modelId,
      input: options.text,
      voice: options.voice,
    };

    if (parsed.speed != null) body.speed = parsed.speed;
    if (parsed.instructions != null) body.instructions = parsed.instructions;
    if (parsed.outputFormat != null) {
      body.response_format = parsed.outputFormat;
    }

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
