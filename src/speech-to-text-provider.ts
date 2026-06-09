import type { WordTimestamp } from "./timestamps.js";

export interface STTModelInfo {
  readonly id: string;
  readonly languages: readonly string[];
  readonly releaseDate: string;
}

export interface SpeechToTextProvider {
  readonly defaultModel: string;
  readonly id: string;
  readonly models: readonly STTModelInfo[];

  transcribe(options: {
    modelId: string;
    audio: Uint8Array;
    mediaType: string;
    // Source text that was synthesized into `audio`. Lets a fallback perform
    // forced alignment (known text → audio) instead of blind transcription.
    // Pure STT providers ignore it.
    text?: string;
    language?: string;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }): Promise<{
    timestamps: WordTimestamp[];
    text?: string;
    providerMetadata?: Record<string, unknown>;
  }>;
}

export interface ResolvedSTTModel {
  readonly modelId: string;
  readonly provider: SpeechToTextProvider;
}
