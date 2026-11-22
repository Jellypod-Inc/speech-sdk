import {
  type AudioOutput,
  DEFAULT_MP3_BITRATE_KBPS,
} from "../../audio-output.js";
import { isWavWithoutSamples } from "../../audio-utils.js";
import { NoSpeechGeneratedError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import {
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

export interface AssemblyAISpeechProviderConfig {
  apiKey?: string;
  /** Defaults to the US zone. Use `https://tts.eu.assemblyai.com` for the EU zone. */
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const ASSEMBLYAI_PROVIDER_ID = "assemblyai" as const;

const ASSEMBLYAI_SAMPLE_RATES = [
  8000, 16_000, 22_050, 24_000, 44_100, 48_000,
] as const;

const ASSEMBLYAI_MP3_BITRATES_KBPS = [32, 48, 64, 96, 128] as const;
const MAX_MP3_KBPS_AT_8KHZ = 64;

export const ASSEMBLYAI_MODELS: readonly ModelInfo[] = [
  {
    id: "assemblyai-tts-1",
    releaseDate: "2026-10-28",
    languages: ["en", "es", "de", "it", "pt", "fr"],
    features: [],
    maxInputChars: 5000,
  },
];

export class AssemblyAISpeechProvider
  implements SpeechProvider<string, string>
{
  readonly id = ASSEMBLYAI_PROVIDER_ID;
  readonly defaultModel = "assemblyai-tts-1";
  readonly models = ASSEMBLYAI_MODELS;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: AssemblyAISpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://tts.us.assemblyai.com";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }) {
    // Without a container AssemblyAI returns headerless PCM; a buffered WAV carries exact sizes.
    const body: Record<string, unknown> = {
      encoding: "pcm_s16le",
      container: "wav",
      ...options.providerOptions,
      text: options.text,
      model_id: options.modelId,
      stream: false,
    };
    if (options.voice) {
      body.voice_id = options.voice;
    }
    const response = await this.fetchFn(`${this.baseURL}/v1/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: resolveApiKey(
          this.apiKey,
          "ASSEMBLYAI_API_KEY",
          "AssemblyAI"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });
    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0 || isWavWithoutSamples(audio)) {
      throw new NoSpeechGeneratedError("AssemblyAI returned no audio.", {
        provider: this.id,
        model: options.modelId,
        reason: "provider_empty_response",
      });
    }
    const durationMs = Number(response.headers.get("X-TTS-Audio-Duration-Ms"));
    return {
      audio,
      mediaType: response.headers.get("Content-Type") ?? "audio/wav",
      audioDurationMs:
        Number.isFinite(durationMs) && durationMs > 0 ? durationMs : undefined,
      providerMetadata: {
        requestId: response.headers.get("X-Request-Id"),
        voiceId: response.headers.get("X-TTS-Voice-Id"),
        billedCharacters: response.headers.get("X-TTS-Billed-Characters"),
      },
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    return this.models.some((model) => model.id === modelId)
      ? ASSEMBLYAI_SAMPLE_RATES
      : [];
  }

  getStitchOptions(modelId: string, options?: { sampleRate?: number }) {
    if (!this.models.some((model) => model.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `assemblyai/${modelId}`,
      this.supportedSampleRates(modelId),
      options?.sampleRate
    );
    return {
      providerOptions: {
        encoding: "pcm_s16le",
        container: "wav",
        sample_rate: rate,
      },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (output.format !== "mp3") {
      const resolved = this.getStitchOptions(modelId, output);
      return (
        resolved && {
          providerOptions: resolved.providerOptions,
          expectedMediaType: resolved.mediaType,
        }
      );
    }
    if (!this.models.some((model) => model.id === modelId)) {
      return;
    }
    const rate = resolveSampleRate(
      `assemblyai/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    return {
      providerOptions: {
        encoding: "mp3",
        container: "raw",
        sample_rate: rate,
        bit_rate: closestMp3Bitrate(output.bitrate, rate) * 1000,
      },
      expectedMediaType: "audio/mpeg",
    };
  }
}

function closestMp3Bitrate(
  requestedKbps: number | undefined,
  sampleRate: number
): number {
  const target = requestedKbps ?? DEFAULT_MP3_BITRATE_KBPS;
  const allowed = ASSEMBLYAI_MP3_BITRATES_KBPS.filter(
    (kbps) => sampleRate > 8000 || kbps <= MAX_MP3_KBPS_AT_8KHZ
  );
  return allowed.reduce((prev, curr) =>
    Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
  );
}

export function createAssemblyAI(config: AssemblyAISpeechProviderConfig = {}) {
  const provider = new AssemblyAISpeechProvider(config);
  return function assemblyai(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(config.fallbackSTT && { fallbackSTT: config.fallbackSTT }),
    };
  };
}
