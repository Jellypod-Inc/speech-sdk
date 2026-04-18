import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";

export interface InworldSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
}

interface InworldAudioConfig {
  audio_encoding?: string;
  sample_rate_hertz?: number;
  [key: string]: unknown;
}

const DEFAULT_AUDIO_ENCODING = "MP3";
const DEFAULT_SAMPLE_RATE_HERTZ = 48_000;

function mediaTypeForEncoding(encoding: string | undefined): string {
  switch ((encoding ?? DEFAULT_AUDIO_ENCODING).toUpperCase()) {
    case "LINEAR16":
      return "audio/wav";
    case "OGG_OPUS":
      return "audio/ogg";
    case "MULAW":
      return "audio/basic";
    case "ALAW":
      return "audio/x-alaw-basic";
    default:
      return "audio/mpeg";
  }
}

export class InworldSpeechProvider implements SpeechProvider<string, string> {
  readonly id = "inworld";
  readonly defaultModel = "inworld-tts-1.5-max";

  // Inworld TTS supports 11 languages out of the box.
  // https://docs.inworld.ai/tts/overview#supported-languages
  private static readonly LANGUAGES = [
    "en",
    "es",
    "fr",
    "de",
    "it",
    "pt",
    "ja",
    "ko",
    "nl",
    "pl",
    "zh",
  ] as const;

  readonly models = [
    {
      id: "inworld-tts-1.5-max",
      releaseDate: "2025-08-15",
      languages: InworldSpeechProvider.LANGUAGES,
      features: ["streaming"],
    },
    {
      id: "inworld-tts-1.5-mini",
      releaseDate: "2025-08-15",
      languages: InworldSpeechProvider.LANGUAGES,
      features: ["streaming"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: InworldSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.inworld.ai";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private buildBody(
    text: string,
    modelId: string,
    voice: string | undefined,
    providerOptions: Record<string, unknown> | undefined
  ): { body: Record<string, unknown>; audioConfig: InworldAudioConfig } {
    const opts = (providerOptions ?? {}) as Record<string, unknown>;
    const { audio_config: audioOverrides, ...rest } = opts;

    const audioConfig: InworldAudioConfig = {
      audio_encoding: DEFAULT_AUDIO_ENCODING,
      sample_rate_hertz: DEFAULT_SAMPLE_RATE_HERTZ,
      ...((audioOverrides as InworldAudioConfig | undefined) ?? {}),
    };

    const body: Record<string, unknown> = {
      ...rest,
      text,
      model_id: modelId,
      audio_config: audioConfig,
    };
    if (voice !== undefined) {
      body.voice_id = voice;
    }

    return { body, audioConfig };
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
    const { body, audioConfig } = this.buildBody(
      options.text,
      options.modelId,
      options.voice,
      options.providerOptions
    );

    const url = `${this.baseURL}/tts/v1/voice`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${resolveApiKey(this.apiKey, "INWORLD_API_KEY", "Inworld")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `inworld/${options.modelId}`);

    const json = (await response.json()) as { audioContent?: string };
    if (!json.audioContent) {
      throw new Error(
        `inworld/${options.modelId}: response missing audioContent`
      );
    }

    return {
      audio: json.audioContent,
      mediaType: mediaTypeForEncoding(audioConfig.audio_encoding),
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
    const { body, audioConfig } = this.buildBody(
      options.text,
      options.modelId,
      options.voice,
      options.providerOptions
    );

    const url = `${this.baseURL}/tts/v1/voice:stream`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${resolveApiKey(this.apiKey, "INWORLD_API_KEY", "Inworld")}`,
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `inworld/${options.modelId}`);

    if (!response.body) {
      throw new Error(`inworld/${options.modelId}: response has no body`);
    }

    return {
      stream: parseInworldNdjsonStream(
        response.body,
        `inworld/${options.modelId}`
      ),
      mediaType: mediaTypeForEncoding(audioConfig.audio_encoding),
    };
  }

  getStitchOptions(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      return {
        providerOptions: {
          audio_config: {
            audio_encoding: "LINEAR16",
            sample_rate_hertz: 24_000,
          },
        },
        mediaType: "audio/wav",
      };
    }
    return undefined;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface InworldNdjsonChunk {
  audioContent?: string;
  error?: { message?: string } | string;
  result?: { audioContent?: string };
}

function extractAudio(line: string): Uint8Array | null {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const parsed = JSON.parse(trimmed) as InworldNdjsonChunk;
  if (parsed.error != null) {
    const message =
      typeof parsed.error === "string"
        ? parsed.error
        : (parsed.error.message ?? "stream error");
    throw new Error(message);
  }
  const b64 = parsed.audioContent ?? parsed.result?.audioContent;
  if (!b64) {
    return null;
  }
  return base64ToBytes(b64);
}

function emitLine(
  line: string,
  controller: ReadableStreamDefaultController<Uint8Array>
): void {
  const audio = extractAudio(line);
  if (audio) {
    controller.enqueue(audio);
  }
}

function drainBuffer(
  state: { buffer: string },
  controller: ReadableStreamDefaultController<Uint8Array>
): void {
  let newlineIndex = state.buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = state.buffer.slice(0, newlineIndex);
    state.buffer = state.buffer.slice(newlineIndex + 1);
    emitLine(line, controller);
    newlineIndex = state.buffer.indexOf("\n");
  }
}

async function pumpStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>
): Promise<void> {
  const decoder = new TextDecoder();
  const state = { buffer: "" };

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      state.buffer += decoder.decode();
      const remaining = state.buffer;
      state.buffer = "";
      emitLine(remaining, controller);
      return;
    }
    state.buffer += decoder.decode(value, { stream: true });
    drainBuffer(state, controller);
  }
}

function parseInworldNdjsonStream(
  source: ReadableStream<Uint8Array>,
  model: string
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        await pumpStream(reader, controller);
        controller.close();
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error(`${model}: ${String(err)}`);
        // Cancel the upstream reader so the underlying fetch body isn't left
        // locked / hanging. Swallow cancel errors — we already have `error`.
        reader.cancel(error).catch(() => {
          /* noop */
        });
        controller.error(error);
      }
    },
    cancel(reason) {
      // Consumer cancelled the parsed stream — propagate to the upstream fetch
      // body so the HTTP connection can be released.
      return reader.cancel(reason);
    },
  });
}

export function createInworld(config: InworldSpeechProviderConfig = {}) {
  const provider = new InworldSpeechProvider(config);

  return function inworld(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
