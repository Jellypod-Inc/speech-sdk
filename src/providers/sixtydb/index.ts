import { decodeAudioToPcm16 } from "../../audio-decode.js";
import type { AudioOutput } from "../../audio-output.js";
import { base64ToUint8Array, wrapPcm16Mono } from "../../audio-utils.js";
import { SpeechSdkProviderError } from "../../errors.js";
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

const RATES = [16_000, 24_000, 48_000] as const;
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
const TRAILING_SLASH = /\/$/;
const VOICE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SixtyDBSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const SIXTYDB_PROVIDER_ID = "sixtydb" as const;

// The API selects the synthesis tier from the workspace voice, not a model ID.
export const SIXTYDB_MODELS: readonly ModelInfo[] = [
  {
    id: "tts",
    releaseDate: "",
    languages: [],
    features: ["streaming"],
    maxInputChars: 5000,
  },
];

type RequestOptions = Parameters<SpeechProvider["generate"]>[0];

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("sixtydb: invalid response record");
  }
  return value as Record<string, unknown>;
}

function validateRecord(record: Record<string, unknown>, rate: number) {
  if (record.success === false || record.error || record.type === "error") {
    throw new Error("sixtydb: synthesis failed");
  }
  if (record.sample_rate !== undefined && record.sample_rate !== rate) {
    throw new Error(
      "sixtydb: response sample rate differs from the requested rate"
    );
  }
  for (const format of [record.encoding, record.output_format]) {
    if (
      format !== undefined &&
      !["LINEAR16", "PCM", "WAV"].includes(String(format).toUpperCase())
    ) {
      throw new Error("sixtydb: expected LINEAR16 audio");
    }
  }
}

async function audioFromRecord(
  value: unknown,
  rate: number,
  depth = 0
): Promise<Uint8Array | undefined> {
  const record = object(value);
  validateRecord(record, rate);
  const payload =
    record.backendResponse === undefined
      ? record
      : object(record.backendResponse);
  validateRecord(payload, rate);
  const result =
    payload.result === undefined ? payload : object(payload.result);
  validateRecord(result, rate);
  const encoded = payload.audio_base64 ?? result.audioContent;
  if (encoded === undefined) {
    return;
  }
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("sixtydb: invalid audio data");
  }
  return await decodeAudio(base64ToUint8Array(encoded), rate, depth);
}

async function decodeAudio(
  bytes: Uint8Array,
  rate: number,
  depth: number
): Promise<Uint8Array | undefined> {
  if (bytes[0] === 123 && bytes[1] === 34) {
    if (depth >= 1) {
      throw new Error("sixtydb: excessive nested audio encoding");
    }
    return await audioFromRecord(
      JSON.parse(new TextDecoder().decode(bytes)),
      rate,
      depth + 1
    );
  }
  if (bytes.length === 0 || bytes.length % 2 !== 0) {
    throw new Error("sixtydb: incomplete PCM audio");
  }
  const signature = new TextDecoder().decode(bytes.subarray(0, 4));
  if (signature === "RIFF") {
    const decoded = await decodeAudioToPcm16(bytes, "audio/wav");
    if (decoded.sampleRate !== rate || decoded.pcm.length === 0) {
      throw new Error("sixtydb: invalid WAV sample rate or empty audio");
    }
    return new Uint8Array(
      decoded.pcm.buffer,
      decoded.pcm.byteOffset,
      decoded.pcm.byteLength
    );
  }
  if (signature === "OggS" || signature.startsWith("ID3")) {
    throw new Error("sixtydb: compressed audio returned for LINEAR16");
  }
  return bytes;
}

async function* readRecords(response: Response): AsyncGenerator<unknown> {
  if (!response.body) {
    throw new Error("sixtydb: response has no body");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const isJson =
    response.headers.get("content-type")?.split(";")[0].trim() ===
    "application/json";
  let buffer = "";
  let size = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        throw new Error("sixtydb: response exceeds 64 MiB");
      }
      buffer += decoder.decode(value, { stream: true });
      if (isJson) {
        continue;
      }
      let newline = buffer.indexOf("\n");
      while (newline !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line) {
          yield JSON.parse(line);
        }
        newline = buffer.indexOf("\n");
      }
    }
    if (buffer.trim()) {
      yield JSON.parse(buffer);
    }
    complete = true;
  } finally {
    if (!complete) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

async function* readAudio(
  response: Response,
  rate: number
): AsyncGenerator<Uint8Array> {
  let received = false;
  try {
    for await (const record of readRecords(response)) {
      const audio = await audioFromRecord(record, rate);
      if (audio) {
        received = true;
        yield audio;
      }
    }
    if (!received) {
      throw new Error("sixtydb: no audio received");
    }
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") {
      throw cause;
    }
    throw new SpeechSdkProviderError(
      cause instanceof Error
        ? cause.message
        : "sixtydb: invalid synthesis response",
      {
        provider: SIXTYDB_PROVIDER_ID,
        model: "tts",
        status: response.status,
        stage: "synthesis",
        retryable: false,
        cause,
      }
    );
  }
}

export class SixtyDBSpeechProvider implements SpeechProvider {
  readonly id = SIXTYDB_PROVIDER_ID;
  readonly defaultModel = "tts";
  readonly models = SIXTYDB_MODELS;
  private readonly config: SixtyDBSpeechProviderConfig;

  constructor(config: SixtyDBSpeechProviderConfig = {}) {
    this.config = { ...config };
  }

  private async request(options: RequestOptions) {
    if (options.modelId !== this.defaultModel) {
      throw new Error(
        "sixtydb: model must be tts; the voice selects the synthesis tier"
      );
    }
    if (!(options.voice && VOICE_ID.test(options.voice))) {
      throw new Error(
        "sixtydb: voice must be a workspace voice UUID from GET /voices"
      );
    }
    if (!options.text.trim() || options.text.length > 5000) {
      throw new Error("sixtydb: text must contain 1–5000 characters");
    }
    const providerOptions = options.providerOptions ?? {};
    if (
      providerOptions.sample_rate !== undefined ||
      providerOptions.audio_encoding !== undefined
    ) {
      throw new Error(
        "sixtydb: use nested audio_config instead of legacy audio options"
      );
    }
    const audioConfig =
      providerOptions.audio_config === undefined
        ? {}
        : object(providerOptions.audio_config);
    if (
      audioConfig.audio_encoding !== undefined &&
      audioConfig.audio_encoding !== "LINEAR16"
    ) {
      throw new Error("sixtydb: only LINEAR16 is supported");
    }
    const requestedRate = audioConfig.sample_rate_hertz;
    if (requestedRate !== undefined && typeof requestedRate !== "number") {
      throw new Error("sixtydb: sample_rate_hertz must be a number");
    }
    const rate = resolveSampleRate(
      "sixtydb/tts",
      RATES,
      requestedRate ?? 24_000
    );
    const apiKey = resolveApiKey(this.config.apiKey, "SIXTYDB_API_KEY", "60db");
    const headers = new Headers(options.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Authorization", `Bearer ${apiKey}`);
    headers.set("X-User-Agent", SDK_USER_AGENT);
    const fetchFn = this.config.fetch ?? globalThis.fetch;
    const response = await fetchFn(
      `${(this.config.baseURL ?? "https://api.60db.ai").replace(TRAILING_SLASH, "")}/tts-synthesize`,
      {
        method: "POST",
        redirect: "error",
        headers,
        signal: options.abortSignal,
        body: JSON.stringify({
          ...providerOptions,
          text: options.text,
          voice_id: options.voice,
          audio_config: { audio_encoding: "LINEAR16", sample_rate_hertz: rate },
          timestamp_type: "NONE",
        }),
      }
    );
    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });
    return { response, rate };
  }

  async generate(options: RequestOptions) {
    const { response, rate } = await this.request(options);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for await (const audio of readAudio(response, rate)) {
      chunks.push(audio);
      size += audio.length;
    }
    const pcm = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      audio: await wrapPcm16Mono(pcm, rate),
      mediaType: "audio/wav",
      audioDurationMs: (size / 2 / rate) * 1000,
    };
  }

  async stream(options: RequestOptions) {
    const abort = new AbortController();
    const signal = options.abortSignal
      ? AbortSignal.any([options.abortSignal, abort.signal])
      : abort.signal;
    const { response, rate } = await this.request({
      ...options,
      abortSignal: signal,
    });
    const iterator = readAudio(response, rate);
    const stream = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const { done, value } = await iterator.next();
          if (done) {
            controller.close();
          } else {
            controller.enqueue(value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
      async cancel() {
        abort.abort();
        await iterator.return(undefined);
      },
    });
    return {
      stream,
      mediaType: `audio/pcm;rate=${rate};channels=1;encoding=s16`,
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    return modelId === this.defaultModel ? RATES : [];
  }

  getStitchOptions(modelId: string, options?: { sampleRate?: number }) {
    if (modelId !== this.defaultModel) {
      return;
    }
    const rate = resolveSampleRate("sixtydb/tts", RATES, options?.sampleRate);
    return {
      providerOptions: {
        audio_config: { audio_encoding: "LINEAR16", sample_rate_hertz: rate },
      },
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    const stitch = this.getStitchOptions(modelId, output);
    return stitch
      ? {
          providerOptions: stitch.providerOptions,
          expectedMediaType: stitch.mediaType,
        }
      : undefined;
  }
}

export function createSixtyDB(config: SixtyDBSpeechProviderConfig = {}) {
  const provider = new SixtyDBSpeechProvider(config);
  return function sixtydb(modelId?: string): ResolvedModel {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(config.fallbackSTT && { fallbackSTT: config.fallbackSTT }),
    };
  };
}
