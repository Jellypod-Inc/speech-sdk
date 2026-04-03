import type { ResolvedModel, Voice } from "./speech-provider.js";

export type SpeechOptions =
  | { symbolExpansion?: false }
  | { symbolExpansion: true; locale?: string };

export interface GenerateSpeechOptions<V extends Voice = Voice> {
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  maxRetries?: number;
  model: string | ResolvedModel<V>;
  options?: SpeechOptions;
  providerOptions?: Record<string, unknown>;
  text: string;
  voice: V;
}
