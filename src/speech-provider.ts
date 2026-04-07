export type Voice = string | { url: string } | { audio: string | Uint8Array };

export interface ModelInfo {
  audioTags: boolean;
  id: string;
  inlineVoiceCloning: boolean;
  languages: readonly string[];
  openSource: boolean;
  releaseDate: string;
  streaming: boolean;
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

  stream?(options: {
    modelId: string;
    text: string;
    voice?: TVoice;
    providerOptions?: Record<string, unknown>;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata?: Record<string, unknown>;
  }>;
}

export interface ResolvedModel<TVoice extends Voice = Voice> {
  modelId: string;
  provider: SpeechProvider<string, TVoice>;
}
