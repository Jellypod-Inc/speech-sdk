import type { ResolvedModel, Voice } from './speech-provider.js';

export type GenerateSpeechOptions<V extends Voice = Voice> = {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
};
