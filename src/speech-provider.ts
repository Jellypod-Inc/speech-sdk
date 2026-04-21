import type { WordTimestamp } from "./timestamps.js";

export type Voice = string | { url: string } | { audio: string | Uint8Array };

/**
 * A capability supported by a model. Today every feature is just an id (a
 * string), meaning "this model has feature X". The union also accepts an
 * object form `{ id, ...params }` so features that need parameters (e.g.
 * `timestamps` with a `mode`) can extend the type without breaking
 * existing string-based features.
 */
export type Feature = string | TimestampsFeature | { readonly id: string };

/**
 * Per-model word-timestamp capability.
 *
 * - `"native"`: the TTS endpoint returns word-level alignment directly in
 *   its response (e.g., ElevenLabs `/with-timestamps`, Cartesia SSE).
 * - `"derived"`: no native alignment; `timestamps: "on"` pipes the generated
 *   audio through an STT round-trip to produce word timings. Extra cost and
 *   latency, but works with any provider that has a usable STT API.
 *
 * Providers without any viable path (same-vendor STT missing or word-level
 * unavailable) declare no TIMESTAMPS feature; `timestamps: "on"` routes them
 * through the default `timestampProvider` (OpenAI Whisper) with a clear
 * error when no fallback key is configured.
 */
export interface TimestampsFeature {
  readonly id: "timestamps";
  readonly mode: "native" | "derived";
}

export interface ModelInfo {
  readonly features: readonly Feature[];
  readonly id: string;
  readonly languages: readonly string[];
  readonly releaseDate: string;
}

/** Built-in feature ids the SDK uses. Providers may add custom strings. */
export const FEATURES = {
  STREAMING: "streaming",
  AUDIO_TAGS: "audio-tags",
  INLINE_VOICE_CLONING: "inline-voice-cloning",
  OPEN_SOURCE: "open-source",
  TIMESTAMPS: "timestamps",
} as const;

export function hasFeature(model: ModelInfo, id: string): boolean {
  for (const f of model.features) {
    if (typeof f === "string" ? f === id : f.id === id) {
      return true;
    }
  }
  return false;
}

export function getFeature<T extends { id: string }>(
  model: ModelInfo,
  id: string
): T | undefined {
  for (const f of model.features) {
    if (typeof f !== "string" && f.id === id) {
      return f as T;
    }
  }
  return undefined;
}

export interface SpeechProvider<
  TModel extends string = string,
  TVoice extends Voice = Voice,
> {
  defaultModel: TModel;

  dialogueCapabilities?(modelId: string):
    | {
        minVoices: number;
        maxVoices: number;
        maxTotalChars?: number;
      }
    | undefined;

  generate(options: {
    modelId: string;
    text: string;
    voice?: TVoice;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    /**
     * Hint from the orchestrator that the caller wants word timestamps. A
     * provider that supports native alignment should switch to its timestamp
     * endpoint (e.g., ElevenLabs `/with-timestamps`) and populate `timestamps`
     * in the return. Providers without native support ignore this flag; the
     * orchestrator then routes through an STT fallback.
     */
    includeTimestamps?: boolean;
  }): Promise<{
    audio: string | Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }>;

  generateDialogue?(options: {
    modelId: string;
    turns: readonly { voice: TVoice; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
    /**
     * Hint that the caller wants word timestamps. A dialogue provider with a
     * native timestamp endpoint (e.g., ElevenLabs text-to-dialogue with
     * alignment) should switch to it and populate `timestamps` in the
     * return. Providers without native support ignore the flag; the
     * conversation orchestrator then falls back to STT on the mixed audio.
     */
    includeTimestamps?: boolean;
  }): Promise<{
    audio: string | Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
  }>;

  getStitchOptions?(modelId: string):
    | {
        providerOptions: Record<string, unknown>;
        mediaType: string;
      }
    | undefined;
  id: string;
  models: readonly ModelInfo[];

  processAudioTags?(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] };

  stream?(options: {
    modelId: string;
    text: string;
    voice?: TVoice;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audioDurationMs?: number;
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
}

export interface ResolvedModel<TVoice extends Voice = Voice> {
  modelId: string;
  provider: SpeechProvider<string, TVoice>;
}

/**
 * Returns true when the resolved model declares `{ id: "timestamps", mode: "native" }`
 * in its features (i.e., its TTS endpoint returns alignment data directly in the
 * response, no STT round-trip needed).
 */
export function modelDeclaresNativeTimestamps(
  resolved: ResolvedModel
): boolean {
  // `.models` is required by the SpeechProvider interface but we use optional
  // chaining so tests/mocks that omit it don't crash here.
  const modelInfo = resolved.provider.models?.find(
    (m) => m.id === resolved.modelId
  );
  if (!modelInfo) {
    return false;
  }
  const feature = getFeature<TimestampsFeature>(modelInfo, "timestamps");
  return feature?.mode === "native";
}
