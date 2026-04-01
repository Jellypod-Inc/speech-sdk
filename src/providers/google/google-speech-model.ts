import type { SpeechProvider } from '../../speech-provider.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';

export interface GoogleSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class GoogleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = 'google';
  readonly defaultModel = 'default';

  readonly models = [
    { id: 'default', languages: ['en'] as const },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GoogleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://texttospeech.googleapis.com/v1';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  /**
   * Derives languageCode from a voice name.
   * E.g., "en-US-Neural2-A" → "en-US"
   */
  private deriveLanguageCode(voice: string): string {
    const parts = voice.split('-');
    return parts.slice(0, 2).join('-');
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
    const apiKey = resolveApiKey(this.apiKey, 'GOOGLE_API_KEY', 'Google Cloud TTS');

    const voiceName = options.voice ?? 'en-US-Neural2-A';
    const languageCode = this.deriveLanguageCode(voiceName);

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      input: { text: options.text },
      voice: { name: voiceName, languageCode },
      audioConfig: { audioEncoding: 'MP3' },
    };

    const url = `${this.baseURL}/text:synthesize?key=${apiKey}`;

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `google/${options.modelId}`);

    const json = (await response.json()) as { audioContent: string };

    return {
      audio: json.audioContent,
      mediaType: 'audio/mpeg',
    };
  }
}
