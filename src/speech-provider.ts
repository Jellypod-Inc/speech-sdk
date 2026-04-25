import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { SPEECH_GATEWAY_PROVIDER_ID } from "./providers/gateway/index.js";
import type { WordTimestamp } from "./timestamps.js";

export type Voice = string | { url: string } | { audio: string | Uint8Array };

export type Feature = string | TimestampsFeature | { readonly id: string };

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
    includeTimestamps?: boolean;
  }): Promise<{
    audio: string | Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
    timestamps?: WordTimestamp[];
    warnings?: string[];
  }>;

  generateDialogue?(options: {
    modelId: string;
    turns: readonly { voice: TVoice; text: string }[];
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
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

export function isSpeechGatewayModel<V extends Voice>(
  model: ResolvedModel<V>
): model is ResolvedModel<V> & { provider: SpeechGatewayProvider } {
  return model.provider.id === SPEECH_GATEWAY_PROVIDER_ID;
}

export function modelDeclaresNativeTimestamps(
  resolved: ResolvedModel
): boolean {
  // Optional-chained so test mocks without .models don't crash.
  const modelInfo = resolved.provider.models?.find(
    (m) => m.id === resolved.modelId
  );
  if (!modelInfo) {
    return false;
  }
  const feature = getFeature<TimestampsFeature>(modelInfo, "timestamps");
  return feature?.mode === "native";
}
