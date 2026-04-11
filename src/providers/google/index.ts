import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Output,
  WavOutputFormat,
} from "mediabunny";
import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";
import { parseSseBase64Stream } from "../../sse-stream.js";

const DEFAULT_GEMINI_SAMPLE_RATE = 24_000;
// biome-ignore lint/performance/useTopLevelRegex: single-use parser
const RATE_PARAM = /(?:^|;)\s*rate=(\d+)/i;

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseSampleRate(mimeType: string): number | undefined {
  const match = mimeType.match(RATE_PARAM);
  return match ? Number(match[1]) : undefined;
}

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Wrap raw 16-bit mono PCM bytes in a WAV container using mediabunny's
 * WavOutputFormat. Cross-platform (browser, Node, edge) and doesn't
 * require Web Codecs global types.
 */
async function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number
): Promise<Uint8Array> {
  const output = new Output({
    format: new WavOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new EncodedAudioPacketSource("pcm-s16");
  output.addAudioTrack(source);
  await output.start();

  // Each 16-bit mono sample is 2 bytes.
  const numSamples = pcm.length / 2;
  const durationSeconds = numSamples / sampleRate;
  const packet = new EncodedPacket(pcm, "key", 0, durationSeconds, 0);
  await source.add(packet, {
    decoderConfig: {
      codec: "pcm-s16",
      numberOfChannels: 1,
      sampleRate,
    },
  });

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("mediabunny: WavOutputFormat produced no buffer");
  }
  return new Uint8Array(buffer);
}

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
      releaseDate: "2025-05-01",
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
      features: ["streaming"],
    },
    {
      id: "gemini-2.5-pro-preview-tts",
      releaseDate: "2025-05-01",
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
      features: ["streaming"],
    },
  ] as const;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GoogleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL =
      config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
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
    audioDurationMs?: number;
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

    // Gemini returns raw 16-bit mono PCM. Wrap in a WAV container so
    // the audio is directly playable by any client.
    const sampleRate =
      parseSampleRate(part.inlineData.mimeType ?? "") ??
      DEFAULT_GEMINI_SAMPLE_RATE;
    const pcm = base64ToBytes(part.inlineData.data);
    const wav = await pcmToWav(pcm, sampleRate);

    return {
      audio: wav,
      mediaType: "audio/wav",
    };
  }

  // NOTE: Gemini TTS on the Generative Language API (`streamGenerateContent`)
  // buffers the full synthesis server-side and flushes in a single burst. This
  // method returns a valid ReadableStream, but first-byte latency matches
  // generateSpeech(). Because we need a valid WAV container (with correct
  // RIFF chunk size), we collect all PCM chunks and emit a single WAV blob
  // as one stream chunk. True progressive Google TTS is only available via:
  //   - Live API (`bidiGenerateContent`, WebSocket) on native-audio models
  //   - Cloud TTS `streamingSynthesize` (gRPC only; no REST binding)
  // Neither is wired up in this SDK today.
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
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const voiceName = options.voice ?? "Kore";

    const speechConfig: Record<string, unknown> = {
      voice_config: {
        prebuilt_voice_config: { voice_name: voiceName },
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

    const url = `${this.baseURL}/models/${options.modelId}:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        ...options.headers,
      },
      body: JSON.stringify(body),
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, `google/${options.modelId}`);

    if (!response.body) {
      throw new Error(`google/${options.modelId}: response has no body`);
    }

    // Capture the sample rate from the first SSE event's mimeType
    // (e.g., "audio/L16;codec=pcm;rate=24000") so we don't hardcode it.
    let detectedSampleRate: number | undefined;

    const { stream: pcmStream } = parseSseBase64Stream(response.body, {
      extractBase64(eventData) {
        const json = safeParseJson(eventData) as {
          candidates?: Array<{
            content?: {
              parts?: Array<{
                inlineData?: { data?: string; mimeType?: string };
              }>;
            };
          }>;
        } | null;
        const part = json?.candidates?.[0]?.content?.parts?.find(
          (p) => p.inlineData?.data
        );
        if (part?.inlineData?.mimeType && detectedSampleRate == null) {
          detectedSampleRate = parseSampleRate(part.inlineData.mimeType);
        }
        return part?.inlineData?.data ?? null;
      },
    });

    // Collect all PCM chunks, wrap in WAV, emit as a single stream chunk.
    const wavStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const chunks: Uint8Array[] = [];
          let total = 0;
          const reader = pcmStream.getReader();
          while (true) {
            const { value, done } = await reader.read();
            if (done) {
              break;
            }
            if (value) {
              chunks.push(value);
              total += value.length;
            }
          }
          const pcm = new Uint8Array(total);
          let offset = 0;
          for (const chunk of chunks) {
            pcm.set(chunk, offset);
            offset += chunk.length;
          }
          const sampleRate = detectedSampleRate ?? DEFAULT_GEMINI_SAMPLE_RATE;
          const wav = await pcmToWav(pcm, sampleRate);
          controller.enqueue(wav);
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });

    return {
      stream: wavStream,
      mediaType: "audio/wav",
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
