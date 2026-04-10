import pRetry from "p-retry";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import {
  ApiError,
  NoSpeechGeneratedError,
  StreamingNotSupportedError,
} from "./errors.js";
import { resolveModel } from "./resolve-provider.js";
import {
  FEATURES,
  hasFeature,
  type ResolvedModel,
  type Voice,
} from "./speech-provider.js";
import type { StreamSpeechResult } from "./stream-speech-result.js";

export async function streamSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  apiKey?: string;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
}): Promise<StreamSpeechResult> {
  const { model, voice, providerOptions, abortSignal, headers } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;

  const modelInfo = resolved.provider.models.find(
    (m) => m.id === resolved.modelId
  );
  if (modelInfo && !hasFeature(modelInfo, FEATURES.STREAMING)) {
    throw new StreamingNotSupportedError(modelIdentifier);
  }
  if (typeof resolved.provider.stream !== "function") {
    throw new StreamingNotSupportedError(modelIdentifier);
  }

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

  const streamFn = resolved.provider.stream.bind(resolved.provider);

  const result = await pRetry(
    () =>
      streamFn({
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

  return {
    audio: result.stream,
    mediaType: result.mediaType,
    providerMetadata: result.providerMetadata,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
