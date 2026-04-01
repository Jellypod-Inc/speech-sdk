import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';
import { ApiError } from '../../errors.js';

export interface FalSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class FalSpeechProvider implements SpeechProvider<string, string | { url: string }> {
  readonly id = 'fal-ai';
  readonly defaultModel = '';

  readonly models = [] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: FalSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://fal.run';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string | { url: string };
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (!options.modelId) {
      throw new Error('fal-ai requires a model ID (e.g., "fal-ai/inworld-tts"). No default model is available.');
    }

    const url = `${this.baseURL}/fal-ai/${options.modelId}`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    if (options.voice != null) {
      if (typeof options.voice === 'string') {
        body.voice = options.voice;
      } else if ('url' in options.voice) {
        body.audio_url = options.voice.url;
      }
    }

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${resolveApiKey(this.apiKey, 'FAL_API_KEY', 'fal')}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fal-ai/${options.modelId}`);

    const json = await response.json() as { audio: { url: string } };

    const audioResponse = await this.fetchFn(json.audio.url, {
      signal: options.abortSignal,
    });

    if (!audioResponse.ok) {
      throw new ApiError(`API error: ${audioResponse.status}`, {
        statusCode: audioResponse.status,
        model: `fal-ai/${options.modelId}`,
        responseBody: await audioResponse.text().catch(() => undefined),
      });
    }

    const arrayBuffer = await audioResponse.arrayBuffer();

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType: 'audio/mpeg',
    };
  }
}
