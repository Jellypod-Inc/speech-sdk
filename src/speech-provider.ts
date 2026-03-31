export interface ModelInfo {
  id: string;
  languages: readonly string[];
}

export interface SpeechProvider<
  TModel extends string = string,
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  id: string;
  defaultModel: TModel;
  models: readonly ModelInfo[];

  generate(options: {
    modelId: string;
    text: string;
    voice?: string;
    providerOptions?: TOptions;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    audio: string | Uint8Array;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
}

export interface ResolvedModel<
  TOptions extends Record<string, unknown> = Record<string, unknown>,
> {
  provider: SpeechProvider<string, TOptions>;
  modelId: string;
}
