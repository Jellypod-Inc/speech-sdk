export type Voice = string | { url: string } | { audio: string | Uint8Array };

/**
 * A capability supported by a model. Today every feature is just an id (a
 * string), meaning "this model has feature X". The union also accepts an
 * object form `{ id, ...params }` so future features that need parameters
 * (e.g. max input tokens, supported sample rates) can extend the type
 * without breaking existing string-based features.
 */
export type Feature = string | { readonly id: string };

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

  generate(options: {
    modelId: string;
    text: string;
    voice?: TVoice;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string | Uint8Array;
    audioDurationMs?: number;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
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
