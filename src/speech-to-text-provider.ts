import type { WordTimestamp } from "./timestamps.js";

/**
 * Minimal info about an STT model. Parallels `ModelInfo` on the TTS side.
 */
export interface STTModelInfo {
  readonly id: string;
  readonly languages: readonly string[];
  readonly releaseDate: string;
}

/**
 * Transcribes generated audio and returns word-level timestamps. This is the
 * "derived" path for `timestamps: "on"` — used when the TTS provider doesn't
 * return alignment data natively.
 *
 * Providers return `WordTimestamp[]` with start/end in seconds. Normalization
 * (ms → seconds, char/phoneme aggregation, tuple → object) happens inside the
 * provider adapter so the public surface is uniform.
 */
export interface SpeechToTextProvider {
  readonly defaultModel: string;
  readonly id: string;
  readonly models: readonly STTModelInfo[];

  transcribe(options: {
    modelId: string;
    audio: Uint8Array;
    mediaType: string;
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
