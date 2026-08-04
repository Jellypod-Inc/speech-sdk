import { UnsupportedSampleRateError } from "./errors.js";
import {
  SPEECH_GATEWAY_PROVIDER_ID,
  type SpeechGatewayProvider,
} from "./providers/gateway/index.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type { WordTimestamp } from "./timestamps.js";

export type Voice = string;

export interface StitchTurnOptions {
  mediaType: string;
  providerOptions: Record<string, unknown>;
}

export interface ResolvedOutputFormat {
  /** The mediaType the provider will produce given those options. May or may not match user's requested format; SDK runs final conversion if not. */
  expectedMediaType: string;
  /** Provider-specific options to merge into the request body. */
  providerOptions: Record<string, unknown>;
}

export type Feature = string | { readonly id: string };

export interface ModelInfo {
  readonly features: readonly Feature[];
  readonly id: string;
  readonly languages: readonly string[];
  readonly maxInputChars?: number;
  readonly releaseDate: string;
}

export const FEATURES = {
  STREAMING: "streaming",
  AUDIO_TAGS: "audio-tags",
  INSTRUCTIONS: "instructions",
  VOICE_CLONING: "voice-cloning",
  VOICE_DESIGN: "voice-design",
  OPEN_SOURCE: "open-source",
  TIMESTAMPS: "timestamps",
} as const;

/**
 * A reference audio sample after the SDK has resolved every input form
 * (bytes / base64 / fetched URL) down to raw bytes. `cloneVoice()` hands these
 * to a provider's `cloneVoice` method; adapters only marshal them to the wire
 * format (multipart vs base64).
 */
export interface NormalizedSample {
  bytes: Uint8Array;
  mediaType: string;
}

export interface CloneVoiceProviderRequest {
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  language?: string;
  name: string;
  providerOptions?: Record<string, unknown>;
  samples: NormalizedSample[];
}

export interface CloneVoiceProviderResult {
  providerMetadata?: Record<string, unknown>;
  voiceId: string;
  warnings?: string[];
}

/** A short audio sample of a designed voice, returned alongside its id. */
export interface VoiceDesignPreview {
  audio: Uint8Array;
  mediaType: string;
}

export interface DesignVoiceProviderRequest {
  abortSignal?: AbortSignal;
  /** Natural-language description of the voice to create. */
  description: string;
  headers?: Record<string, string>;
  /** BCP-47. Used by providers that key voice design on language. */
  language?: string;
  /** Display name for the persisted voice. */
  name: string;
  /** Text spoken in the returned preview. Providers requiring it default it. */
  previewText?: string;
  providerOptions?: Record<string, unknown>;
}

export interface DesignVoiceProviderResult {
  preview?: VoiceDesignPreview;
  providerMetadata?: Record<string, unknown>;
  voiceId: string;
  warnings?: string[];
}

export function hasFeature(model: ModelInfo, id: string): boolean {
  return model.features.some((f) =>
    typeof f === "string" ? f === id : f.id === id
  );
}

export interface SpeechProvider<
  TModel extends string = string,
  TVoice extends Voice = Voice,
> {
  /**
   * Create a persisted cloned voice from reference samples and return a reusable
   * voice ID. Providers that can't clone omit this; `cloneVoice()` throws
   * `VoiceCloningUnsupportedError` for them. The SDK has already normalized the
   * samples, enforced `name`, and validated the sample count before this runs.
   * Language-requiring providers default `language` to "en" themselves and
   * report it via `warnings`.
   */
  cloneVoice?(
    options: CloneVoiceProviderRequest
  ): Promise<CloneVoiceProviderResult>;
  defaultModel: TModel;

  /**
   * Create a persisted voice from a natural-language description and return a
   * reusable voice ID. Providers that can't design omit this; `designVoice()`
   * throws `VoiceDesignUnsupportedError` for them. The SDK has already validated
   * `name` and `description` before this runs. Providers absorb any multi-step
   * (design → persist) flow internally so the caller always gets one reusable id.
   */
  designVoice?(
    options: DesignVoiceProviderRequest
  ): Promise<DesignVoiceProviderResult>;

  dialogueCapabilities?(modelId: string):
    | {
        maxVoices: number;
        maxTotalChars?: number;
      }
    | undefined;

  generate(options: {
    modelId: string;
    text: string;
    instructions?: string;
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
    turns: readonly { voice: TVoice; text: string; instructions?: string }[];
    instructions?: string;
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

  getStitchOptions?(
    modelId: string,
    opts?: { sampleRate?: number }
  ): StitchTurnOptions | undefined;
  id: string;

  /** Max reference samples this provider accepts for cloning. Default 1. */
  maxCloneSamples?(): number;
  models: readonly ModelInfo[];

  processAudioTags?(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] };

  /** Resolve the spoken-text budget after provider-owned prompt framing. */
  resolveMaxInputChars?(
    modelId: string,
    options?: { instructions?: string }
  ): number | undefined;

  /**
   * Given the user's desired output format, return the provider-specific options
   * that produce the closest native match, plus the mediaType that the provider
   * will return. The SDK applies a final mediabunny pass if expectedMediaType
   * differs from the user's chosen format. Return `undefined` if the provider
   * cannot produce any format that the SDK can convert from (i.e. only emits
   * compressed audio that doesn't match the user's request).
   */
  resolveOutputFormat?(
    modelId: string,
    output: import("./audio-output.js").AudioOutput
  ): ResolvedOutputFormat | undefined;

  stream?(options: {
    modelId: string;
    text: string;
    instructions?: string;
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

  /**
   * Sample rates (Hz) the provider's API can natively produce for this model.
   * `getStitchOptions` and `resolveOutputFormat` validate any caller-supplied
   * `sampleRate` against this set. The SDK defaults to `max(...)` when the
   * caller doesn't supply one. Providers that don't expose rate selection may
   * omit this; a runtime error is thrown if the caller supplies one.
   */
  supportedSampleRates?(modelId: string): readonly number[];
}

export interface ResolvedModel<TVoice extends Voice = Voice> {
  fallbackSTT?: ResolvedSTTModel;
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
  const modelInfo = resolved.provider.models?.find(
    (m) => m.id === resolved.modelId
  );
  return modelInfo != null && hasFeature(modelInfo, FEATURES.TIMESTAMPS);
}

export function modelMaxInputChars(
  resolved: ResolvedModel,
  options?: { instructions?: string }
): number | undefined {
  return (
    resolved.provider.resolveMaxInputChars?.(resolved.modelId, options) ??
    resolved.provider.models?.find((m) => m.id === resolved.modelId)
      ?.maxInputChars
  );
}

/**
 * Resolves a caller-requested sampleRate against a provider's supported set.
 * Returns the requested rate if supported, the max supported rate if unspecified,
 * or throws UnsupportedSampleRateError if the request is not in the set.
 */
export function resolveSampleRate(
  modelIdentifier: string,
  supported: readonly number[],
  requested: number | undefined
): number {
  if (supported.length === 0) {
    throw new Error(
      `${modelIdentifier}: supportedSampleRates returned empty set`
    );
  }
  if (requested == null) {
    return Math.max(...supported);
  }
  if (!supported.includes(requested)) {
    throw new UnsupportedSampleRateError(modelIdentifier, requested, supported);
  }
  return requested;
}
