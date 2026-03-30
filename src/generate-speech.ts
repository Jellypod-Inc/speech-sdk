import type { SpeechProvider, ResolvedModel } from './speech-provider.js';
import type { SpeechResult, GeneratedAudioFile } from './speech-result.js';
import { DefaultGeneratedAudioFile } from './speech-result.js';
import { NoSpeechGeneratedError } from './errors.js';
import { resolveModel } from './resolve-provider.js';
import { withRetry } from './retry.js';

export async function generateSpeech<
  T extends Record<string, unknown> = Record<string, unknown>,
>(options: {
  model: string | ResolvedModel<T>;
  text: string;
  voice?: string;
  providerOptions?: T;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<SpeechResult> {
  const { model, text, voice, providerOptions, abortSignal, headers } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model);

  const result = await withRetry(
    () =>
      resolved.provider.generate({
        modelId: resolved.modelId,
        text,
        voice,
        providerOptions,
        abortSignal,
        headers,
      }),
    { maxRetries, abortSignal },
  );

  const audioData = result.audio;
  const isEmpty =
    audioData instanceof Uint8Array
      ? audioData.length === 0
      : typeof audioData === 'string' && audioData.length === 0;

  if (isEmpty) {
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
