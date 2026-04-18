import { ApiError, StreamingNotSupportedError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface FalSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

export class FalSpeechProvider
  implements SpeechProvider<string, string | { url: string }>
{
  readonly id = "fal-ai";
  readonly defaultModel = "";

  readonly models = [
    {
      id: "f5-tts",
      releaseDate: "2024-10-08",
      languages: ["en", "zh", "fr", "it", "hi", "ja", "ru", "es", "fi"],
      features: ["open-source", "inline-voice-cloning"],
    },
    {
      id: "kokoro",
      releaseDate: "2025-01-27",
      languages: ["en", "fr", "ko", "ja", "zh"],
      features: ["open-source"],
    },
    {
      id: "dia-tts",
      releaseDate: "2025-04-21",
      languages: ["en"],
      features: ["open-source", "inline-voice-cloning"],
    },
    {
      id: "orpheus-tts",
      releaseDate: "2025-03-18",
      languages: ["en", "es", "fr", "de", "it", "pt", "zh"],
      features: ["open-source"],
    },
    {
      id: "index-tts-2",
      releaseDate: "2025-09-08",
      languages: ["en", "zh"],
      features: ["open-source", "inline-voice-cloning"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: FalSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://fal.run";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
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
      throw new Error(
        'fal-ai requires a model ID (e.g., "fal-ai/inworld-tts"). No default model is available.'
      );
    }

    const url = `${this.baseURL}/fal-ai/${options.modelId}`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    if (options.voice != null) {
      if (typeof options.voice === "string") {
        body.voice = options.voice;
      } else if ("url" in options.voice) {
        body.audio_url = options.voice.url;
      }
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${resolveApiKey(this.apiKey, "FAL_API_KEY", "fal")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fal-ai/${options.modelId}`);

    const json = (await response.json()) as { audio: { url: string } };

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
      mediaType: "audio/mpeg",
    };
  }

  stream(options: { modelId: string }): Promise<never> {
    return Promise.reject(
      new StreamingNotSupportedError(`fal-ai/${options.modelId}`)
    );
  }

  getStitchOptions(_modelId: string) {
    // fal-hosted models (Dia, Orpheus, F5-TTS, Kokoro, Index-TTS 2) currently
    // return MP3, and this provider hard-codes audio/mpeg as the mediaType.
    // Stitch needs PCM/WAV, so we decline participation — StitchUnsupportedError
    // surfaces the offending model at dispatch time.
    return undefined;
  }

  dialogueCapabilities(modelId: string) {
    if (modelId === "dia-tts") {
      return { minVoices: 1, maxVoices: 2 };
    }
    return undefined;
  }

  async generateDialogue(options: {
    modelId: string;
    turns: readonly { voice: string | { url: string }; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (options.modelId !== "dia-tts") {
      throw new Error(
        `fal-ai/${options.modelId} does not support native dialogue; use dia-tts.`
      );
    }

    const voiceKeyOf = (v: { url: string } | string) =>
      typeof v === "string" ? `s:${v}` : `u:${v.url}`;

    const voiceToTag = new Map<string, string>();
    const tagged: string[] = [];
    for (const t of options.turns) {
      const k = voiceKeyOf(t.voice);
      let tag = voiceToTag.get(k);
      if (!tag) {
        tag = `[S${voiceToTag.size + 1}]`;
        voiceToTag.set(k, tag);
      }
      tagged.push(`${tag} ${t.text}`);
    }
    const text = tagged.join(" ");

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text,
    };

    // If any turn carries a URL voice reference, forward the first one as
    // audio_url (Dia supports one reference clip per request).
    const firstUrlVoice = options.turns.find(
      (t) => typeof t.voice !== "string" && "url" in t.voice
    )?.voice as { url: string } | undefined;
    if (firstUrlVoice) {
      body.audio_url = firstUrlVoice.url;
    }

    const url = `${this.baseURL}/fal-ai/${options.modelId}`;
    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Key ${resolveApiKey(this.apiKey, "FAL_API_KEY", "fal")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `fal-ai/${options.modelId}`);

    const json = (await response.json()) as { audio: { url: string } };
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

    return {
      audio: new Uint8Array(await audioResponse.arrayBuffer()),
      mediaType: "audio/mpeg",
    };
  }
}

export function createFal(config: FalSpeechProviderConfig = {}) {
  const provider = new FalSpeechProvider(config);

  return function fal(
    modelId?: string
  ): ResolvedModel<string | { url: string }> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
