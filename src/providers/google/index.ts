import { handleErrorResponse, resolveApiKey } from "../../provider-utils.js";
import type { ResolvedModel, SpeechProvider } from "../../speech-provider.js";
import { parseSseBase64Stream } from "../../sse-stream.js";
import { buildWavHeader, parseSampleRate, pcmToWav } from "./pcm-to-wav.js";

const DEFAULT_GEMINI_SAMPLE_RATE = 24_000;

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
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

function prependHeader(
  source: ReadableStream<Uint8Array>,
  header: Uint8Array
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(header);
      const reader = source.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            controller.enqueue(value);
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
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
    const wav = pcmToWav(pcm, sampleRate);

    return {
      audio: wav,
      mediaType: "audio/wav",
    };
  }

  // NOTE: Gemini TTS on the Generative Language API (`streamGenerateContent`)
  // buffers the full synthesis server-side and flushes in a single burst. This
  // method returns a valid ReadableStream, but first-byte latency matches
  // generateSpeech(). True progressive Google TTS is only available via:
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
        return part?.inlineData?.data ?? null;
      },
    });

    // Prepend a WAV header so the stream is directly playable.
    // Use 0xFFFFFFFF (max uint32) as dataSize since we don't know the
    // final length — most players read until EOF.
    const wavHeader = buildWavHeader({
      sampleRate: DEFAULT_GEMINI_SAMPLE_RATE,
      numChannels: 1,
      bitsPerSample: 16,
      dataSize: 0xff_ff_ff_ff,
    });
    const stream = prependHeader(pcmStream, wavHeader);

    return {
      stream,
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
