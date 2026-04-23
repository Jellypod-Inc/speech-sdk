import { MissingApiKeyError } from "../../errors.js";
import { handleErrorResponse, SDK_USER_AGENT } from "../../provider-utils.js";
import type {
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
} from "../../speech-provider.js";
import { CartesiaSpeechProvider } from "../cartesia/index.js";
import { DeepgramSpeechProvider } from "../deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../elevenlabs/index.js";
import { FalSpeechProvider } from "../fal/index.js";
import { FishAudioSpeechProvider } from "../fish-audio/index.js";
import { GoogleSpeechProvider } from "../google/index.js";
import { HumeSpeechProvider } from "../hume/index.js";
import { InworldSpeechProvider } from "../inworld/index.js";
import { MistralSpeechProvider } from "../mistral/index.js";
import { MurfSpeechProvider } from "../murf/index.js";
import { OpenAISpeechProvider } from "../openai/index.js";
import { ResembleSpeechProvider } from "../resemble/index.js";
import { XaiSpeechProvider } from "../xai/index.js";

export interface SpeechGatewayProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

let cachedModels: readonly ModelInfo[] | undefined;

// Aggregates every built-in provider's model list under `<provider>/<model>`
// ids so capability checks (e.g. native timestamps) keep working when the
// user routes through the gateway.
function aggregatedModels(): readonly ModelInfo[] {
  if (cachedModels) {
    return cachedModels;
  }
  const sources: SpeechProvider[] = [
    new OpenAISpeechProvider({}),
    new ElevenLabsSpeechProvider({}),
    new DeepgramSpeechProvider({}),
    new CartesiaSpeechProvider({}),
    new HumeSpeechProvider({}),
    new InworldSpeechProvider({}),
    new GoogleSpeechProvider({}),
    new FishAudioSpeechProvider({}),
    new MurfSpeechProvider({}),
    new ResembleSpeechProvider({}),
    new FalSpeechProvider({}),
    new MistralSpeechProvider({}),
    new XaiSpeechProvider({}),
  ];
  const flattened: ModelInfo[] = [];
  for (const src of sources) {
    for (const m of src.models) {
      flattened.push({
        id: `${src.id}/${m.id}`,
        releaseDate: m.releaseDate,
        languages: m.languages,
        features: m.features,
      });
    }
  }
  cachedModels = flattened;
  return cachedModels;
}

export class SpeechGatewayProvider implements SpeechProvider<string, string> {
  readonly id = "speech-gateway";
  readonly defaultModel = "openai/gpt-4o-mini-tts";

  get models(): readonly ModelInfo[] {
    return aggregatedModels();
  }

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: SpeechGatewayProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.speechgateway.com/v1";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private resolveKey(): string {
    const key =
      this.apiKey ??
      (typeof process === "undefined"
        ? undefined
        : process.env?.SPEECH_GATEWAY_API_KEY);
    if (!key) {
      const err = new MissingApiKeyError({
        providerName: "Speech Gateway",
        envVar: "SPEECH_GATEWAY_API_KEY",
      });
      err.message =
        "Speech Gateway API key is required. Sign up at https://speechgateway.com to get a key, then pass it via the `apiKey` option or set the SPEECH_GATEWAY_API_KEY environment variable.";
      throw err;
    }
    return key;
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
    if (!options.voice) {
      throw new Error(
        `speech-gateway/${options.modelId}: "voice" is required when routing through the speech gateway in inline mode.`
      );
    }

    const body: Record<string, unknown> = {
      mode: "inline",
      model: options.modelId,
      voice: options.voice,
      text: options.text,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `speech-gateway/${options.modelId}`);

    const arrayBuffer = await response.arrayBuffer();
    const mediaType = response.headers.get("content-type") ?? "audio/mpeg";
    const upstreamProvider = response.headers.get("x-speech-provider");
    const upstreamModel = response.headers.get("x-speech-model");

    const providerMetadata: Record<string, unknown> = {};
    if (upstreamProvider) {
      providerMetadata.upstreamProvider = upstreamProvider;
    }
    if (upstreamModel) {
      providerMetadata.upstreamModel = upstreamModel;
    }

    return {
      audio: new Uint8Array(arrayBuffer),
      mediaType,
      providerMetadata:
        Object.keys(providerMetadata).length > 0 ? providerMetadata : undefined,
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
    if (!options.voice) {
      throw new Error(
        `speech-gateway/${options.modelId}: "voice" is required when routing through the speech gateway in inline mode.`
      );
    }

    const body: Record<string, unknown> = {
      mode: "inline",
      model: options.modelId,
      voice: options.voice,
      text: options.text,
    };
    if (options.providerOptions) {
      body.providerOptions = options.providerOptions;
    }

    const url = `${this.baseURL}/audio/speech`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.resolveKey()}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `speech-gateway/${options.modelId}`);

    if (!response.body) {
      throw new Error(
        `speech-gateway/${options.modelId}: response has no body`
      );
    }

    return {
      stream: response.body,
      mediaType: response.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

export function createSpeechGateway(config: SpeechGatewayProviderConfig = {}) {
  const provider = new SpeechGatewayProvider(config);
  return function speechGateway(modelId?: string): ResolvedModel<string> {
    return { provider, modelId: modelId ?? provider.defaultModel };
  };
}
