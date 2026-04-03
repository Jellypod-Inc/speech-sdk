import pRetry from "p-retry";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { ApiError, NoSpeechGeneratedError } from "./errors.js";
import { preprocessText } from "./preprocess-text.js";
import { resolveModel } from "./resolve-provider.js";
import type { ResolvedModel, Voice } from "./speech-provider.js";
import type { SpeechResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import type { SpeechOptions } from "./types.js";

export async function generateSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  options?: SpeechOptions;
}): Promise<SpeechResult> {
  const { model, voice, providerOptions, abortSignal, headers } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model);
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;

  const preprocessedText = preprocessText(options.text, options.options);

  let processedText: string;
  let warnings: string[];

  if (resolved.provider.processAudioTags) {
    ({ text: processedText, warnings } = resolved.provider.processAudioTags(
      preprocessedText,
      resolved.modelId
    ));
  } else {
    const tags = detectAudioTags(preprocessedText);
    if (tags.length > 0) {
      ({ text: processedText, warnings } = stripAudioTags(
        preprocessedText,
        modelIdentifier
      ));
    } else {
      processedText = preprocessedText;
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
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
