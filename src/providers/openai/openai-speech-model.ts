import type { SpeechProvider } from '../../speech-provider.js';
import { ApiError } from '../../errors.js';
import { openaiSpeechOptionsSchema, type OpenAISpeechOptions } from './openai-options.js';

export interface OpenAISpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class OpenAISpeechProvider implements SpeechProvider<string, OpenAISpeechOptions> {
  readonly id = 'openai';
  readonly defaultModel = 'gpt-4o-mini-tts';

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: OpenAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.openai.com/v1';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  private resolveApiKey(): string {
    const key = this.apiKey ?? (typeof process !== 'undefined' ? process.env?.OPENAI_API_KEY : undefined);
    if (!key) {
      throw new Error(
        'OpenAI API key is required. Pass it via apiKey option or set the OPENAI_API_KEY environment variable.',
      );
    }
    return key;
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
      voice: options.voice ?? 'alloy',
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
        'Authorization': `Bearer ${this.resolveApiKey()}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => undefined);
      throw new ApiError(`OpenAI API error: ${response.status}`, {
        statusCode: response.status,
        model: `openai/${options.modelId}`,
        responseBody,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get('content-type') ?? 'audio/mpeg';

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }
}
