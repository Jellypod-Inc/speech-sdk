import type { AudioOutput } from "../../audio-output.js";
import { stripAudioTags } from "../../audio-tags.js";
import { base64ToUint8Array } from "../../audio-utils.js";
import { appendProviderOption, appendSampleBlob } from "../../clone-voice.js";
import { SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type CloneVoiceProviderRequest,
  type CloneVoiceProviderResult,
  type DesignVoiceProviderRequest,
  type DesignVoiceProviderResult,
  hasFeature,
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

export interface FishAudioSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const FISH_AUDIO_PROVIDER_ID = "fish-audio" as const;

// Fish Audio WAV/PCM accepts 8k–44.1k; MP3 is 32k–44.1k and Opus is 48k only.
const FISH_AUDIO_WAV_RATES = [8000, 16_000, 24_000, 32_000, 44_100] as const;
const FISH_AUDIO_MP3_RATES = [32_000, 44_100] as const;

export const FISH_AUDIO_MODELS: readonly ModelInfo[] = [
  {
    id: "s2-pro",
    releaseDate: "2026-03-09",
    languages: ["ja", "en", "zh", "ko", "es", "pt", "ar", "ru", "fr", "de"],
    features: [
      "streaming",
      "audio-tags",
      "open-source",
      "voice-cloning",
      "voice-design",
    ],
  },
] as const;

export class FishAudioSpeechProvider implements SpeechProvider<string, string> {
  readonly id = FISH_AUDIO_PROVIDER_ID;
  readonly defaultModel = "s2-pro";

  readonly models = FISH_AUDIO_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: FishAudioSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.fish.audio";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (
      this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `fish-audio/${modelId}`);
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
    const url = `${this.baseURL}/v1/tts`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };

    if (options.voice) {
      body.reference_id = options.voice;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
    };
  }

  async stream(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const url = `${this.baseURL}/v1/tts`;

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text: options.text,
    };
    if (options.voice) {
      body.reference_id = options.voice;
    }

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    if (!response.body) {
      throw new Error(`fish-audio/${options.modelId}: response has no body`);
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return FISH_AUDIO_WAV_RATES;
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `fish-audio/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    return {
      providerOptions: { format: "wav", sample_rate: rate },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    switch (output.format) {
      case "wav": {
        const rate = resolveSampleRate(
          `fish-audio/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: { format: "wav", sample_rate: rate },
          expectedMediaType: "audio/wav",
        };
      }
      case "mp3": {
        // Fish MP3 supports a narrower set than WAV/PCM (32k/44.1k only).
        const rate = resolveSampleRate(
          `fish-audio/${modelId}`,
          FISH_AUDIO_MP3_RATES,
          output.sampleRate
        );
        return {
          providerOptions: { format: "mp3", sample_rate: rate },
          expectedMediaType: "audio/mpeg",
        };
      }
      case "pcm": {
        const rate = resolveSampleRate(
          `fish-audio/${modelId}`,
          this.supportedSampleRates(modelId),
          output.sampleRate
        );
        return {
          providerOptions: { format: "wav", sample_rate: rate },
          expectedMediaType: "audio/wav",
        };
      }
      default:
        return;
    }
  }

  maxCloneSamples(): number {
    return 10;
  }

  async cloneVoice(
    options: CloneVoiceProviderRequest
  ): Promise<CloneVoiceProviderResult> {
    const form = new FormData();
    form.append("type", "tts");
    form.append("title", options.name);
    form.append("train_mode", "fast");
    form.append("visibility", "private");

    for (const [i, s] of options.samples.entries()) {
      appendSampleBlob(form, "voices", s, i);
    }

    for (const [key, value] of Object.entries(options.providerOptions ?? {})) {
      appendProviderOption(form, key, value);
    }

    const response = await this.fetchFn(`${this.baseURL}/model`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as Record<string, unknown>;
    const voiceId = json._id;
    if (typeof voiceId !== "string") {
      throw new SpeechSDKError("fish-audio: clone response missing _id");
    }
    return { voiceId, providerMetadata: json };
  }

  async designVoice(
    options: DesignVoiceProviderRequest
  ): Promise<DesignVoiceProviderResult> {
    const designBody: Record<string, unknown> = {
      ...options.providerOptions,
      instruction: options.description,
      n: 1,
    };
    if (options.previewText != null) {
      designBody.reference_text = options.previewText;
    }
    if (options.language != null) {
      designBody.language = options.language;
    }

    const response = await this.fetchFn(`${this.baseURL}/v1/voice-design`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: "voice-design-1",
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(designBody),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    const json = (await response.json()) as {
      candidates?: { audio_base64?: unknown }[];
    };
    const candidate = json.candidates?.[0];
    if (typeof candidate?.audio_base64 !== "string") {
      throw new SpeechSDKError(
        "fish-audio: voice design response missing candidates[].audio_base64"
      );
    }

    // Fish voice design is stateless — persist the candidate audio via the clone endpoint to get a reusable id.
    const audio = base64ToUint8Array(candidate.audio_base64);
    const cloned = await this.cloneVoice({
      samples: [{ bytes: audio, mediaType: "audio/wav" }],
      name: options.name,
      abortSignal: options.abortSignal,
      headers: options.headers,
    });

    return {
      voiceId: cloned.voiceId,
      preview: { audio, mediaType: "audio/wav" },
      providerMetadata: {
        design: json as Record<string, unknown>,
        ...(cloned.providerMetadata && { model: cloned.providerMetadata }),
      },
    };
  }

  dialogueCapabilities(modelId: string) {
    if (modelId === "s2-pro") {
      return { maxVoices: 4 };
    }
    return;
  }

  async generateDialogue(options: {
    modelId: string;
    turns: readonly { voice: string; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (options.modelId !== "s2-pro") {
      throw new Error(
        `fish-audio/${options.modelId} does not support native dialogue; use s2-pro.`
      );
    }

    const voiceToIndex = new Map<string, number>();
    const tagged: string[] = [];
    for (const t of options.turns) {
      let idx = voiceToIndex.get(t.voice);
      if (idx === undefined) {
        idx = voiceToIndex.size;
        voiceToIndex.set(t.voice, idx);
      }
      tagged.push(`<|speaker:${idx}|>${t.text}`);
    }
    const text = tagged.join("\n");
    const referenceIds = Array.from(voiceToIndex.keys());

    const body: Record<string, unknown> = {
      ...options.providerOptions,
      text,
      reference_id: referenceIds,
    };

    const response = await this.fetchFn(`${this.baseURL}/v1/tts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resolveApiKey(this.apiKey, "FISH_AUDIO_API_KEY", "Fish Audio")}`,
        model: options.modelId,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response);

    return {
      audio: new Uint8Array(await response.arrayBuffer()),
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

export function createFishAudio(config: FishAudioSpeechProviderConfig = {}) {
  const provider = new FishAudioSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function fishAudio(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
