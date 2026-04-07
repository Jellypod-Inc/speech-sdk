import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface MistralSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class MistralSpeechProvider
  implements SpeechProvider<string, string | { audio: string | Uint8Array }>
{
  readonly id = "mistral";
  readonly defaultModel = "voxtral-mini-tts-2603";
  readonly models = [
    {
      id: "voxtral-mini-tts-2603",
      audioTags: false,
      languages: [
        "en",
        "fr",
        "de",
        "es",
        "nl",
        "pt",
        "it",
        "hi",
        "ar",
      ] as const,
      releaseDate: "2026-03-23",
      openSource: true,
      inlineVoiceCloning: true,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MistralSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.mistral.ai/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string | { audio: string | Uint8Array };
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string;
    mediaType: string;
  }> {
    const body: Record<string, unknown> = {
      response_format: "mp3",
      ...options.providerOptions,
      model: options.modelId,
      input: options.text,
    };

    if (options.voice != null) {
      if (typeof options.voice === "string") {
        body.voice_id = options.voice;
      } else if ("audio" in options.voice) {
        const audio = options.voice.audio;
        if (audio instanceof Uint8Array) {
          let binaryString = "";
          for (const byte of audio) {
            binaryString += String.fromCharCode(byte);
          }
          body.ref_audio = btoa(binaryString);
        } else {
          body.ref_audio = audio;
        }
      }
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "MISTRAL_API_KEY", "Mistral")}`,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `mistral/${options.modelId}`);

    const json = (await response.json()) as { audio_data: string };

    return {
      audio: json.audio_data,
      mediaType: "audio/mpeg",
    };
  }
}

export function createMistral(config: MistralSpeechProviderConfig = {}) {
  const provider = new MistralSpeechProvider(config);
  return function mistral(
    modelId?: string
  ): ResolvedModel<string | { audio: string | Uint8Array }> {
    return { provider, modelId: modelId ?? provider.defaultModel };
  };
}
