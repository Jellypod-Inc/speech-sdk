export type Voice = string | { url: string } | { audio: string | Uint8Array };

export interface ModelInfo {
  id: string;
  inlineVoiceCloning: boolean;
  languages: readonly string[];
  openSource: boolean;
  releaseDate: string;
  zeroDataRetention: boolean;
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
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
  id: string;
  models: readonly ModelInfo[];

  processAudioTags?(
    text: string,
    modelId: string
  ): { text: string; warnings: string[] };
}

export interface ResolvedModel<TVoice extends Voice = Voice> {
  modelId: string;
  provider: SpeechProvider<string, TVoice>;
}
