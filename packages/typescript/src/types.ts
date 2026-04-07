import type { ResolvedModel, Voice } from "./speech-provider.js";

export interface GenerateSpeechOptions<V extends Voice = Voice> {
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  maxRetries?: number;
  model: string | ResolvedModel<V>;
  providerOptions?: Record<string, unknown>;
  text: string;
  voice: V;
}
