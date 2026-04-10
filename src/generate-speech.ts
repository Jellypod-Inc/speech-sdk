import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { ApiError, NoSpeechGeneratedError } from "./errors.js";
import type { SpeechMetadata } from "./metadata.js";
import { resolveModel } from "./resolve-provider.js";
import type { ResolvedModel, Voice } from "./speech-provider.js";
import type { SpeechResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";

export async function generateSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  apiKey?: string;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<SpeechResult> {
  const { model, voice, providerOptions, abortSignal, headers } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;

  let processedText: string;
  let warnings: string[];

  if (resolved.provider.processAudioTags) {
    ({ text: processedText, warnings } = resolved.provider.processAudioTags(
      options.text,
      resolved.modelId
    ));
  } else {
    const tags = detectAudioTags(options.text);
    if (tags.length > 0) {
      ({ text: processedText, warnings } = stripAudioTags(
        options.text,
        modelIdentifier
      ));
    } else {
      processedText = options.text;
      warnings = [];
    }
  }

  if (processedText.trim().length === 0) {
    throw new NoSpeechGeneratedError(
      warnings.length > 0
        ? `Text is empty after removing unsupported audio tags for ${modelIdentifier}.`
        : "Text must not be empty."
    );
  }

  const startTime = performance.now();

  const result = await pRetry(
    () =>
      resolved.provider.generate({
        modelId: resolved.modelId,
        text: processedText,
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
    }
  );

  const latencyMs = Math.round(performance.now() - startTime);

  const audioData = result.audio;

  if (audioData.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  const audio = new DefaultGeneratedAudioFile({
    data: audioData,
    mediaType: result.mediaType,
  });

  const audioDurationMs =
    (await computeAudioDuration(audioData, result.mediaType)) ??
    result.audioDurationMs;

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars: processedText.length,
    provider: resolved.provider.id,
    model: resolved.modelId,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
