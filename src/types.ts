import type { ResolvedModel } from './speech-provider.js';

export type GenerateSpeechOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  model: string | ResolvedModel<T>;
  text: string;
  voice: string;
  providerOptions?: T;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
};
