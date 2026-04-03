import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface GoogleSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class GoogleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "google";
  readonly defaultModel = "gemini-2.5-flash-preview-tts";

  readonly models = [
    {
      id: "gemini-2.5-flash-preview-tts",
      languages: [
        "en",
        "fr",
        "de",
        "es",
        "pt",
        "zh",
        "ja",
        "ko",
        "hi",
        "it",
        "nl",
        "pl",
        "ru",
        "sv",
        "tr",
        "id",
        "ar",
        "cs",
        "da",
        "fi",
        "el",
        "hu",
        "ro",
        "uk",
      ],
      releaseDate: "2025-05-01",
      audioTags: false,
      openSource: false,
      inlineVoiceCloning: false,
      zeroDataRetention: false,
    },
    {
      id: "gemini-2.5-pro-preview-tts",
      languages: [
        "en",
        "fr",
        "de",
        "es",
        "pt",
        "zh",
        "ja",
        "ko",
        "hi",
        "it",
        "nl",
        "pl",
        "ru",
        "sv",
        "tr",
        "id",
        "ar",
        "cs",
        "da",
        "fi",
        "el",
        "hu",
        "ro",
        "uk",
      ],
      releaseDate: "2025-05-01",
      audioTags: false,
      openSource: false,
      inlineVoiceCloning: false,
      zeroDataRetention: false,
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GoogleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL =
      config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
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
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const voiceName = options.voice ?? "Kore";

    const speechConfig: Record<string, unknown> = {
      voice_config: {
        prebuilt_voice_config: {
          voice_name: voiceName,
        },
      },
    };

    const body: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [{ text: options.text }],
        },
      ],
      generationConfig: {
        responseModalities: ["audio"],
        speech_config: speechConfig,
        ...options.providerOptions,
      },
    };

    const url = `${this.baseURL}/models/${options.modelId}:generateContent?key=${apiKey}`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `google/${options.modelId}`);

    const json = (await response.json()) as {
      candidates: Array<{
        content: {
          parts: Array<{ inlineData?: { mimeType: string; data: string } }>;
        };
      }>;
    };

    const part = json.candidates?.[0]?.content?.parts?.find(
      (p) => p.inlineData != null
    );

    if (!part?.inlineData) {
      throw new Error("No audio data in Gemini TTS response");
    }

    return {
      audio: part.inlineData.data,
      mediaType: part.inlineData.mimeType ?? "audio/mp3",
    };
  }
}

export function createGoogle(config: GoogleSpeechProviderConfig = {}) {
  const provider = new GoogleSpeechProvider(config);

  return function google(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
