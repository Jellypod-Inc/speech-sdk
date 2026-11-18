import {
  type AudioOutput,
  DEFAULT_MP3_BITRATE_KBPS,
} from "../../audio-output.js";
import { NoSpeechGeneratedError, SpeechSDKError } from "../../errors.js";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import {
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

export interface MicrosoftSpeechProviderConfig {
  apiKey?: string;
  /** Speech resource endpoint, e.g. a custom domain `https://<resource>.cognitiveservices.azure.com`. Overrides `region`. */
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
  /** Azure Speech resource region, e.g. `eastus`. Defaults to `AZURE_SPEECH_REGION`. */
  region?: string;
}

export const MICROSOFT_PROVIDER_ID = "microsoft" as const;

const DEFAULT_VOICE = "en-US-Harper";
const NATIVE_SAMPLE_RATE = 24_000;
const MAI_LANGUAGES = [
  "cs",
  "da",
  "de",
  "en",
  "es",
  "fi",
  "fr",
  "hi",
  "hu",
  "id",
  "it",
  "ko",
  "nb",
  "nl",
  "pl",
  "pt",
  "ro",
  "ru",
  "sv",
  "th",
  "tr",
  "vi",
  "zh",
] as const;

const VOICE_SUFFIXES: Readonly<Record<string, string>> = {
  "mai-voice-2.1": "MAI-Voice-2.1",
  "mai-voice-2.1-flash": "MAI-Voice-2.1-Flash",
};

export const MICROSOFT_MODELS: readonly ModelInfo[] = [
  {
    id: "mai-voice-2.1",
    releaseDate: "2026-10-01",
    languages: MAI_LANGUAGES,
    features: [],
  },
  {
    id: "mai-voice-2.1-flash",
    releaseDate: "2026-10-01",
    languages: MAI_LANGUAGES,
    features: [],
  },
];

const WAV_FORMATS: Readonly<Record<number, string>> = {
  8000: "riff-8khz-16bit-mono-pcm",
  16000: "riff-16khz-16bit-mono-pcm",
  22050: "riff-22050hz-16bit-mono-pcm",
  24000: "riff-24khz-16bit-mono-pcm",
  44100: "riff-44100hz-16bit-mono-pcm",
  48000: "riff-48khz-16bit-mono-pcm",
};
const WAV_SAMPLE_RATES = Object.keys(WAV_FORMATS).map(Number);

const MP3_BITRATES_KBPS: Readonly<Record<number, readonly number[]>> = {
  16000: [32, 64, 128],
  24000: [48, 96, 160],
  48000: [96, 192],
};
const MP3_SAMPLE_RATES = Object.keys(MP3_BITRATES_KBPS).map(Number);

const XML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};
const XML_SPECIAL_CHARS = /[&<>"']/g;
const VOICE_LOCALE = /^([a-z]{2,3}-[A-Z]{2})-/;
const TRAILING_SLASHES = /\/+$/;

function escapeXml(value: string): string {
  return value.replace(XML_SPECIAL_CHARS, (char) => XML_ESCAPES[char] ?? char);
}

function buildSsml(args: {
  text: string;
  voiceName: string;
  style?: unknown;
  styleDegree?: unknown;
}): string {
  const lang = VOICE_LOCALE.exec(args.voiceName)?.[1] ?? "en-US";
  let content = escapeXml(args.text);
  if (typeof args.style === "string" && args.style) {
    const degree =
      typeof args.styleDegree === "number"
        ? ` styledegree="${args.styleDegree}"`
        : "";
    content = `<mstts:express-as style="${escapeXml(args.style)}"${degree}>${content}</mstts:express-as>`;
  }
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="${lang}"><voice name="${escapeXml(args.voiceName)}">${content}</voice></speak>`;
}

export class MicrosoftSpeechProvider implements SpeechProvider<string, string> {
  readonly id = MICROSOFT_PROVIDER_ID;
  readonly defaultModel = "mai-voice-2.1-flash";
  readonly models = MICROSOFT_MODELS;
  private readonly apiKey: string | undefined;
  private readonly baseURL: string | undefined;
  private readonly region: string | undefined;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: MicrosoftSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL;
    this.region = config.region;
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private endpoint(): string {
    if (this.baseURL) {
      return `${this.baseURL.replace(TRAILING_SLASHES, "")}/cognitiveservices/v1`;
    }
    const region =
      this.region ??
      (typeof process === "undefined"
        ? undefined
        : process.env?.AZURE_SPEECH_REGION);
    if (!region) {
      throw new SpeechSDKError(
        "Microsoft MAI-Voice needs the Azure Speech resource region. Pass `region` to createMicrosoft() or set AZURE_SPEECH_REGION."
      );
    }
    return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
  }

  async generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }) {
    const suffix = VOICE_SUFFIXES[options.modelId];
    if (!suffix) {
      throw new SpeechSDKError(
        `microsoft/${options.modelId} is not a known MAI-Voice model.`
      );
    }
    const voice = options.voice ?? DEFAULT_VOICE;
    const voiceName = voice.includes(":") ? voice : `${voice}:${suffix}`;
    const {
      outputFormat = WAV_FORMATS[NATIVE_SAMPLE_RATE],
      style,
      styleDegree,
    } = options.providerOptions ?? {};
    if (typeof outputFormat !== "string") {
      throw new SpeechSDKError(
        "Microsoft providerOptions.outputFormat must be an Azure Speech output format string."
      );
    }
    const response = await this.fetchFn(this.endpoint(), {
      method: "POST",
      headers: {
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": outputFormat,
        "Ocp-Apim-Subscription-Key": resolveApiKey(
          this.apiKey,
          "AZURE_SPEECH_KEY",
          "Microsoft (Azure Speech)"
        ),
        ...options.headers,
      },
      body: buildSsml({ text: options.text, voiceName, style, styleDegree }),
      signal: options.abortSignal,
    });
    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    const audio = new Uint8Array(await response.arrayBuffer());
    if (audio.length === 0) {
      throw new NoSpeechGeneratedError("Azure Speech returned no audio.", {
        provider: this.id,
        model: options.modelId,
        reason: "provider_empty_response",
      });
    }
    return {
      audio,
      mediaType: outputFormat.includes("mp3") ? "audio/mpeg" : "audio/wav",
      providerMetadata: {
        requestId: response.headers.get("X-RequestId"),
        voice: voiceName,
      },
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    return modelId in VOICE_SUFFIXES ? WAV_SAMPLE_RATES : [];
  }

  getStitchOptions(modelId: string, options?: { sampleRate?: number }) {
    if (!(modelId in VOICE_SUFFIXES)) {
      return;
    }
    const rate = resolveSampleRate(
      `microsoft/${modelId}`,
      WAV_SAMPLE_RATES,
      options?.sampleRate ?? NATIVE_SAMPLE_RATE
    );
    return {
      providerOptions: { outputFormat: WAV_FORMATS[rate] },
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
    if (!(modelId in VOICE_SUFFIXES)) {
      return;
    }
    const rate = resolveSampleRate(
      `microsoft/${modelId}`,
      MP3_SAMPLE_RATES,
      output.sampleRate ?? NATIVE_SAMPLE_RATE
    );
    const target = output.bitrate ?? DEFAULT_MP3_BITRATE_KBPS;
    const kbps = (MP3_BITRATES_KBPS[rate] ?? []).reduce((prev, curr) =>
      Math.abs(curr - target) < Math.abs(prev - target) ? curr : prev
    );
    return {
      providerOptions: {
        outputFormat: `audio-${rate / 1000}khz-${kbps}kbitrate-mono-mp3`,
      },
      expectedMediaType: "audio/mpeg",
    };
  }
}

export function createMicrosoft(config: MicrosoftSpeechProviderConfig = {}) {
  const provider = new MicrosoftSpeechProvider(config);
  return function microsoft(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(config.fallbackSTT && { fallbackSTT: config.fallbackSTT }),
    };
  };
}
