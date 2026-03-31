import pRetry, { AbortError } from 'p-retry';
import type { ResolvedModel } from './speech-provider.js';
import type { SpeechResult } from './speech-result.js';
import { DefaultGeneratedAudioFile } from './speech-result.js';
import { NoSpeechGeneratedError, ApiError } from './errors.js';
import { resolveModel } from './resolve-provider.js';

export async function generateSpeech<
  T extends Record<string, unknown> = Record<string, unknown>,
>(options: {
  model: string | ResolvedModel<T>;
  text: string;
  voice: string;
  providerOptions?: T;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<SpeechResult> {
  const { model, text, voice, providerOptions, abortSignal, headers } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model);

  const result = await pRetry(
    () =>
      resolved.provider.generate({
        modelId: resolved.modelId,
        text,
        voice,
        providerOptions,
        abortSignal,
        headers,
      }),
    {
      retries: maxRetries,
      signal: abortSignal,
      shouldRetry: ({ error }) => {
        if (error instanceof ApiError && error.statusCode < 500) {
          return false;
        }
        return true;
      },
    },
  );

  const audioData = result.audio;

  if (audioData.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const audio = new DefaultGeneratedAudioFile({
    data: audioData,
    mediaType: result.mediaType,
  });

  return {
    audio,
    providerMetadata: result.providerMetadata,
  };
}
