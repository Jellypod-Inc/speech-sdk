import { z } from "zod";
import type { AudioOutput } from "../../audio-output.js";
import { stripAudioTags } from "../../audio-tags.js";
import {
  base64ToUint8Array,
  parseMediaTypeParam,
  wrapPcm16Mono,
} from "../../audio-utils.js";
import { NoSpeechGeneratedError, SpeechSDKError } from "../../errors.js";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
  truncate,
} from "../../provider-utils.js";
import {
  hasFeature,
  type ModelInfo,
  type ResolvedModel,
  resolveSampleRate,
  type SpeechProvider,
} from "../../speech-provider.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";
import { parseSseBase64Stream } from "../../sse-stream.js";

function safeParseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

// Both /generateContent endpoints share the same shape; tolerate missing intermediate fields for nullability differences.
// finishReason, part text and promptFeedback are diagnostics: a TTS call reads them only when no audio came back.
const generateContentResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  inlineData: z
                    .object({ data: z.string(), mimeType: z.string() })
                    .optional(),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .optional(),
  promptFeedback: z.object({ blockReason: z.string().optional() }).optional(),
});

type GenerateContentResponse = z.infer<typeof generateContentResponseSchema>;

function findAudioPart(json: GenerateContentResponse) {
  const part = json.candidates?.[0]?.content?.parts?.find(
    (p) => p.inlineData?.data
  );
  return part?.inlineData;
}

const TERMINAL_PUNCTUATION_RE = /[.!?…:;,]$/;

// Gemini TTS is generateContent, so a payload short enough to read as a bare chat turn can come back
// answered rather than voiced. Quoting gives the model an explicit object to read instead of respond to.
// Deliberately below the length of a short sentence: longer input has never shown this failure, and
// quoting it risks changing delivery on text that would otherwise voice correctly.
const TERSE_INPUT_MAX_CHARS = 24;

function reshapeTerseInput(text: string): string | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0 || trimmed.length > TERSE_INPUT_MAX_CHARS) {
    return;
  }
  // Already quoted: reshaping would be a no-op, and a no-op retry is the one the logs prove cannot help.
  if (trimmed.startsWith('"')) {
    return;
  }
  const punctuated = TERMINAL_PUNCTUATION_RE.test(trimmed)
    ? trimmed
    : `${trimmed}.`;
  return `"${punctuated}"`;
}

// A no-audio 200 is the provider declining; the reason only ever arrives as finishReason, a prompt block, or a text part.
function describeMissingAudio(
  modelIdentifier: string,
  json: GenerateContentResponse
): string {
  const details: string[] = [];

  const blockReason = json.promptFeedback?.blockReason;
  if (blockReason) {
    details.push(`blockReason: ${blockReason}`);
  }

  const candidate = json.candidates?.[0];
  if (candidate) {
    if (candidate.finishReason) {
      details.push(`finishReason: ${candidate.finishReason}`);
    }
    const text = (candidate.content?.parts ?? [])
      .map((part) => part.text?.trim())
      .filter((part) => part)
      .join(" ");
    if (text) {
      details.push(`text response: "${truncate(text)}"`);
    }
  } else {
    details.push("no candidates");
  }

  const suffix = details.length > 0 ? ` (${details.join("; ")})` : "";
  return `${modelIdentifier}: no audio in generateContent response${suffix}`;
}

const DEFAULT_GEMINI_SAMPLE_RATE = 24_000;

// Without a directive, generateContent answers terse input as a chat prompt and a TTS-only model 400s; the text before the colon is delivery guidance Gemini reads from but doesn't voice.
const READ_ALOUD_DIRECTIVE = "Read aloud: ";

// 5k total prompt chars leaves broad headroom below Gemini TTS's 8,192-token input ceiling across languages and tokenization patterns.
const GEMINI_TTS_REQUEST_CHAR_BUDGET = 5000;
const GEMINI_TTS_TEXT_CHAR_BUDGET =
  GEMINI_TTS_REQUEST_CHAR_BUDGET - READ_ALOUD_DIRECTIVE.length;

// Real progressive streaming is only available via the /interactions endpoint, and only for 3.1+ TTS models.
// The legacy generateContent/streamGenerateContent endpoints buffer the full clip server-side.
const INTERACTIONS_STREAMING_MODELS = new Set(["gemini-3.1-flash-tts-preview"]);

// /interactions step.delta events carry base64 PCM in delta.data, tagged by delta.mime_type (e.g. "audio/l16"). Non-audio deltas are ignored.
const interactionAudioDeltaSchema = z.object({
  delta: z.object({
    mime_type: z.string(),
    data: z.string(),
  }),
});

export interface GoogleSpeechProviderConfig {
  apiKey?: string;
  baseURL?: string;
  fallbackSTT?: ResolvedSTTModel;
  fetch?: typeof globalThis.fetch;
}

export const GOOGLE_PROVIDER_ID = "google" as const;

const GOOGLE_GEMINI_2_5_LANGUAGES = [
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
] as const;

const GOOGLE_GEMINI_3_1_LANGUAGES = [
  "af",
  "am",
  "ar",
  "az",
  "be",
  "bg",
  "bn",
  "ca",
  "ceb",
  "cmn",
  "cs",
  "da",
  "de",
  "el",
  "en",
  "es",
  "et",
  "eu",
  "fa",
  "fi",
  "fil",
  "fr",
  "gl",
  "gu",
  "he",
  "hi",
  "hr",
  "ht",
  "hu",
  "hy",
  "id",
  "is",
  "it",
  "ja",
  "jv",
  "ka",
  "kn",
  "ko",
  "kok",
  "la",
  "lb",
  "lo",
  "lt",
  "lv",
  "mai",
  "mg",
  "mk",
  "ml",
  "mn",
  "mr",
  "ms",
  "my",
  "nb",
  "ne",
  "nl",
  "nn",
  "or",
  "pa",
  "pl",
  "ps",
  "pt",
  "ro",
  "ru",
  "sd",
  "si",
  "sk",
  "sl",
  "sq",
  "sr",
  "sv",
  "sw",
  "ta",
  "te",
  "th",
  "tr",
  "uk",
  "ur",
  "vi",
] as const;

export const GOOGLE_MODELS: readonly ModelInfo[] = [
  {
    id: "gemini-3.1-flash-tts-preview",
    releaseDate: "2026-04-15",
    languages: GOOGLE_GEMINI_3_1_LANGUAGES,
    features: ["streaming", "audio-tags", "instructions"],
    maxInputChars: GEMINI_TTS_TEXT_CHAR_BUDGET,
  },
  {
    id: "gemini-2.5-flash-preview-tts",
    releaseDate: "2025-05-01",
    languages: GOOGLE_GEMINI_2_5_LANGUAGES,
    features: ["streaming", "instructions"],
    maxInputChars: GEMINI_TTS_TEXT_CHAR_BUDGET,
  },
  {
    id: "gemini-2.5-pro-preview-tts",
    releaseDate: "2025-05-01",
    languages: GOOGLE_GEMINI_2_5_LANGUAGES,
    features: ["streaming", "instructions"],
    maxInputChars: GEMINI_TTS_TEXT_CHAR_BUDGET,
  },
] as const;

export class GoogleSpeechProvider implements SpeechProvider<string, string> {
  readonly id = GOOGLE_PROVIDER_ID;
  readonly defaultModel = "gemini-2.5-flash-preview-tts";

  readonly models = GOOGLE_MODELS;

  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: GoogleSpeechProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseURL =
      config.baseURL ?? "https://generativelanguage.googleapis.com/v1beta";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  // Gemini 3.1 Flash TTS supports inline audio tags natively; older models don't and need stripping.
  processAudioTags(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] } {
    if (
      this.models.some((m) => m.id === modelId && hasFeature(m, "audio-tags"))
    ) {
      return { text, warnings: [] };
    }
    return stripAudioTags(text, `google/${modelId}`);
  }

  resolveMaxInputChars(
    modelId: string,
    options?: { instructions?: string }
  ): number | undefined {
    const model = this.models.find((candidate) => candidate.id === modelId);
    if (!model?.maxInputChars) {
      return;
    }
    const instructionFramingChars = options?.instructions
      ? options.instructions.length + 2
      : 0;
    const textBudget = model.maxInputChars - instructionFramingChars;
    if (textBudget < 1) {
      throw new SpeechSDKError(
        `google/${modelId}: instructions exceed the conservative Gemini TTS input budget.`
      );
    }
    return textBudget;
  }

  private async postGenerateContent(
    options: {
      modelId: string;
      instructions?: string;
      voice?: string;
      providerOptions?: Record<string, unknown>;
      abortSignal?: AbortSignal;
      headers?: Record<string, string>;
    },
    text: string
  ): Promise<GenerateContentResponse> {
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const body: Record<string, unknown> = {
      contents: [
        {
          role: "user",
          parts: [
            {
              text: options.instructions
                ? `${options.instructions}\n\n${READ_ALOUD_DIRECTIVE}${text}`
                : `${READ_ALOUD_DIRECTIVE}${text}`,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ["audio"],
        speech_config: {
          voice_config: {
            prebuilt_voice_config: { voice_name: options.voice ?? "Kore" },
          },
        },
        ...options.providerOptions,
      },
    };

    const response = await this.fetchFn(
      `${this.baseURL}/models/${options.modelId}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Agent": SDK_USER_AGENT,
          ...options.headers,
        },
        body: JSON.stringify(body),
        signal: options.abortSignal,
      }
    );

    await handleErrorResponse(response, {
      provider: this.id,
      model: options.modelId,
      stage: "synthesis",
    });

    return generateContentResponseSchema.parse(await response.json());
  }

  async generate(options: {
    modelId: string;
    text: string;
    instructions?: string;
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
    const modelIdentifier = `google/${options.modelId}`;

    const json = await this.postGenerateContent(options, options.text);
    let part = findAudioPart(json);

    // The identical retry the SDK already performs cannot help a response that came back without audio,
    // so a terse payload gets one differently shaped attempt before the segment is failed.
    let reshapedJson: GenerateContentResponse | undefined;
    if (!part) {
      const reshaped = reshapeTerseInput(options.text);
      if (reshaped) {
        reshapedJson = await this.postGenerateContent(options, reshaped);
        part = findAudioPart(reshapedJson);
      }
    }

    if (!part) {
      throw new NoSpeechGeneratedError(
        reshapedJson
          ? `${describeMissingAudio(modelIdentifier, json)}; retried with a quoted payload and still got none (${describeMissingAudio(modelIdentifier, reshapedJson)})`
          : describeMissingAudio(modelIdentifier, json)
      );
    }

    // Gemini returns raw 16-bit mono PCM; wrap as WAV so callers can play it directly.
    const sampleRate =
      parseMediaTypeParam(part.mimeType ?? "", "rate") ??
      DEFAULT_GEMINI_SAMPLE_RATE;
    const pcm = base64ToUint8Array(part.data);
    const wav = await wrapPcm16Mono(pcm, sampleRate);

    return {
      audio: wav,
      mediaType: "audio/wav",
    };
  }

  async stream(options: {
    modelId: string;
    text: string;
    instructions?: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    if (INTERACTIONS_STREAMING_MODELS.has(options.modelId)) {
      return this.streamInteractions(options);
    }

    // 2.5 TTS has no progressive streaming endpoint; wrap the buffered generate() output as a single-chunk stream.
    const { audio, mediaType, providerMetadata } = await this.generate(options);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(audio);
        controller.close();
      },
    });
    return { stream, mediaType, providerMetadata };
  }

  // Real-time TTS streaming is served by /interactions with stream:true (Gemini 3.1+); chunks are raw 16-bit mono PCM @ 24kHz.
  private async streamInteractions(options: {
    modelId: string;
    text: string;
    instructions?: string;
    voice?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
  }> {
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const voiceName = options.voice ?? "Kore";

    const body: Record<string, unknown> = {
      model: options.modelId,
      input: options.instructions
        ? `${options.instructions}\n\n${READ_ALOUD_DIRECTIVE}${options.text}`
        : options.text,
      response_format: { type: "audio" },
      generation_config: {
        speech_config: [{ voice: voiceName }],
        ...options.providerOptions,
      },
      stream: true,
    };

    const response = await this.fetchFn(`${this.baseURL}/interactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "Api-Revision": "2026-05-20",
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

    if (!response.body) {
      throw new Error(`google/${options.modelId}: response has no body`);
    }

    const { stream } = parseSseBase64Stream(response.body, {
      extractBase64(eventData) {
        const result = interactionAudioDeltaSchema.safeParse(
          safeParseJson(eventData)
        );
        if (!result.success) {
          return null;
        }
        return result.data.delta.mime_type.startsWith("audio/")
          ? result.data.delta.data
          : null;
      },
    });

    return {
      stream,
      mediaType: `audio/pcm;rate=${DEFAULT_GEMINI_SAMPLE_RATE}`,
    };
  }

  supportedSampleRates(modelId: string): readonly number[] {
    if (!this.models.some((m) => m.id === modelId)) {
      return [];
    }
    return [DEFAULT_GEMINI_SAMPLE_RATE];
  }

  getStitchOptions(modelId: string, opts?: { sampleRate?: number }) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `google/${modelId}`,
      this.supportedSampleRates(modelId),
      opts?.sampleRate
    );
    // Provider wraps Gemini's raw PCM as WAV before returning; stitch decoding uses the WAV codepath.
    return {
      providerOptions: {},
      mediaType: "audio/wav",
    };
  }

  resolveOutputFormat(modelId: string, output: AudioOutput) {
    if (!this.models.some((m) => m.id === modelId)) {
      return;
    }
    resolveSampleRate(
      `google/${modelId}`,
      this.supportedSampleRates(modelId),
      output.sampleRate
    );
    // Gemini TTS endpoint has no format parameter — provider always wraps raw PCM as WAV.
    // SDK conversion path handles pcm-unwrap and mp3-encode from the wav baseline.
    if (
      output.format === "wav" ||
      output.format === "pcm" ||
      output.format === "mp3"
    ) {
      return {
        providerOptions: {},
        expectedMediaType: "audio/wav",
      };
    }
    return;
  }

  dialogueCapabilities(modelId: string) {
    if (this.models.some((m) => m.id === modelId)) {
      // Gemini multi-speaker TTS supports at most 2 unique voices (API validator: "enabled_voices must equal 2").
      // maxTotalChars: Gemini TTS sessions share a 32k-token window between input text and generated audio tokens,
      // and audio dominates — so a conservative per-call text budget avoids server-side truncation on long dialogue.
      // Kept well under the window because generation latency climbs with output length; conversations beyond this
      // are split into parallel native-dialogue blocks and stitched, which is faster than one long call.
      return { maxVoices: 2, maxTotalChars: 2500 };
    }
    return;
  }

  async generateDialogue(options: {
    modelId: string;
    turns: readonly { voice: string; text: string; instructions?: string }[];
    instructions?: string;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }> {
    const apiKey = resolveApiKey(this.apiKey, "GOOGLE_API_KEY", "Google");

    const voiceToLabel = new Map<string, string>();
    const labelled: string[] = [];
    for (const turn of options.turns) {
      let label = voiceToLabel.get(turn.voice);
      if (!label) {
        label = `Speaker${voiceToLabel.size + 1}`;
        voiceToLabel.set(turn.voice, label);
      }
      labelled.push(`${label}: ${turn.text}`);
    }
    const transcript = labelled.join("\n");
    const perTurnInstructions = options.turns
      .map((turn, index) => {
        if (!turn.instructions) {
          return null;
        }
        const label = voiceToLabel.get(turn.voice) ?? `Speaker${index + 1}`;
        return `${label}: ${turn.instructions}`;
      })
      .filter((instruction): instruction is string => instruction !== null);
    const instructionParts = [
      options.instructions,
      perTurnInstructions.length > 0
        ? perTurnInstructions.join("\n")
        : undefined,
    ].filter((instruction): instruction is string => instruction !== undefined);
    const text =
      instructionParts.length > 0
        ? `Delivery instructions:\n${instructionParts.join("\n")}\n\nTranscript:\n${transcript}`
        : transcript;

    const speakerVoiceConfigs = Array.from(voiceToLabel.entries()).map(
      ([voiceName, speaker]) => ({
        speaker,
        voice_config: {
          prebuilt_voice_config: { voice_name: voiceName },
        },
      })
    );

    const body: Record<string, unknown> = {
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseModalities: ["audio"],
        speech_config: {
          multi_speaker_voice_config: {
            speaker_voice_configs: speakerVoiceConfigs,
          },
        },
        ...options.providerOptions,
      },
    };

    const url = `${this.baseURL}/models/${options.modelId}:generateContent?key=${apiKey}`;

    const response = await this.fetchFn(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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

    const json = generateContentResponseSchema.parse(await response.json());
    const part = findAudioPart(json);
    if (!part) {
      throw new NoSpeechGeneratedError(
        describeMissingAudio(`google/${options.modelId}`, json)
      );
    }

    const pcm = base64ToUint8Array(part.data);
    const sampleRate =
      parseMediaTypeParam(part.mimeType ?? "", "rate") ??
      DEFAULT_GEMINI_SAMPLE_RATE;
    const wav = await wrapPcm16Mono(pcm, sampleRate);

    return {
      audio: wav,
      mediaType: "audio/wav",
    };
  }
}

export function createGoogle(config: GoogleSpeechProviderConfig = {}) {
  const provider = new GoogleSpeechProvider(config);
  const fallbackSTT = config.fallbackSTT;

  return function google(modelId?: string): ResolvedModel<string> {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
      ...(fallbackSTT && { fallbackSTT }),
    };
  };
}
