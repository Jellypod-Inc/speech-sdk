import type { SpeechProvider } from '../../speech-provider.js';
import { SpeechSDKError } from '../../errors.js';
import { resolveApiKey, handleErrorResponse } from '../../provider-utils.js';
import {
  elevenlabsSpeechOptionsSchema,
  type ElevenLabsSpeechOptions,
} from './elevenlabs-options.js';

export interface ElevenLabsSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class ElevenLabsSpeechProvider
  implements SpeechProvider<string, ElevenLabsSpeechOptions>
{
  readonly id = 'elevenlabs';
  readonly defaultModel = 'eleven_multilingual_v2';

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: ElevenLabsSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? 'https://api.elevenlabs.io';
    this.fetchFn = config.fetch ?? globalThis.fetch;
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: ElevenLabsSpeechOptions;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (!options.voice) {
      throw new SpeechSDKError(
        'ElevenLabs requires a voice ID. Pass it via the voice option.',
      );
    }

    const parsed = options.providerOptions
      ? elevenlabsSpeechOptionsSchema.parse(options.providerOptions)
      : {};

    const body: Record<string, unknown> = {
      text: options.text,
      model_id: options.modelId,
    };

    const voiceSettings: Record<string, unknown> = {};
    if (parsed.voiceSettings) {
      if (parsed.voiceSettings.stability != null)
        voiceSettings.stability = parsed.voiceSettings.stability;
      if (parsed.voiceSettings.similarityBoost != null)
        voiceSettings.similarity_boost = parsed.voiceSettings.similarityBoost;
      if (parsed.voiceSettings.style != null)
        voiceSettings.style = parsed.voiceSettings.style;
      if (parsed.voiceSettings.speed != null)
        voiceSettings.speed = parsed.voiceSettings.speed;
      if (parsed.voiceSettings.useSpeakerBoost != null)
        voiceSettings.use_speaker_boost = parsed.voiceSettings.useSpeakerBoost;
    }
    if (Object.keys(voiceSettings).length > 0) {
      body.voice_settings = voiceSettings;
    }

    if (parsed.previousRequestIds)
      body.previous_request_ids = parsed.previousRequestIds;
    if (parsed.nextRequestIds) body.next_request_ids = parsed.nextRequestIds;
    if (parsed.previousText) body.previous_text = parsed.previousText;
    if (parsed.nextText) body.next_text = parsed.nextText;
    if (parsed.seed != null) body.seed = parsed.seed;
    if (parsed.languageCode) body.language_code = parsed.languageCode;
    if (parsed.applyTextNormalization)
      body.apply_text_normalization = parsed.applyTextNormalization;
    if (parsed.applyLanguageTextNormalization != null)
      body.apply_language_text_normalization =
        parsed.applyLanguageTextNormalization;
    if (parsed.pronunciationDictionaryLocators) {
      body.pronunciation_dictionary_locators =
        parsed.pronunciationDictionaryLocators.map((loc) => ({
          pronunciation_dictionary_id: loc.pronunciationDictionaryId,
          ...(loc.versionId && { version_id: loc.versionId }),
        }));
    }

    const queryParams = new URLSearchParams();
    if (parsed.outputFormat) {
      queryParams.set('output_format', parsed.outputFormat);
    }

    let url = `${this.baseURL}/v1/text-to-speech/${options.voice}`;
    const queryString = queryParams.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': resolveApiKey(this.apiKey, 'ELEVENLABS_API_KEY', 'ElevenLabs'),
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `elevenlabs/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get('content-type') ?? 'audio/mpeg';
    const requestId = response.headers.get('request-id');

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
      providerMetadata: requestId ? { requestId } : undefined,
    };
  }
}
