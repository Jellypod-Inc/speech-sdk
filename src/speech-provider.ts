export type Voice =
  | string
  | { url: string }
  | { audio: string | Uint8Array }

export interface ModelInfo {
  id: string;
  languages: readonly string[];
}

export interface SpeechProvider<
  TModel extends string = string,
  TVoice extends Voice = Voice,
> {
  id: string;
  defaultModel: TModel;
  models: readonly ModelInfo[];

  generate(options: {
    modelId: string;
    text: string;
    voice?: TVoice;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string | Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
}

export interface ResolvedModel<TVoice extends Voice = Voice> {
  provider: SpeechProvider<string, TVoice>;
  modelId: string;
}
