import pRetry from "p-retry";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import {
  NoSpeechGeneratedError,
  StreamingNotSupportedError,
} from "./errors.js";
import type { SpeechMetadata } from "./metadata.js";
import { mergeRules } from "./pronunciations/merge.js";
import { substitute } from "./pronunciations/substitute.js";
import type { PronunciationsInput } from "./pronunciations/types.js";
import { validatePronunciationsInput } from "./pronunciations/validate.js";
import type { SpeechGatewayProvider } from "./providers/gateway/index.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
import {
  FEATURES,
  hasFeature,
  isSpeechGatewayModel,
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
  pronunciations?: PronunciationsInput;
}): Promise<StreamSpeechResult> {
  const { model, voice, providerOptions, abortSignal, headers } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;
  const isGateway = isSpeechGatewayModel(resolved);
  validatePronunciationsInput(options.pronunciations, isGateway);

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

  let textToSend = processedText;
  if (!isGateway && options.pronunciations?.rules?.length) {
    const ruleMap = mergeRules(options.pronunciations.rules);
    textToSend = substitute(processedText, ruleMap).text;
  }

  const streamFn = resolved.provider.stream.bind(resolved.provider);

  const startTime = performance.now();

  const result = await pRetry(() => {
    if (isGateway) {
      const gatewayProvider = resolved.provider as SpeechGatewayProvider;
      return gatewayProvider.stream({
        modelId: resolved.modelId,
        text: textToSend,
        voice: voice as unknown as string,
        providerOptions,
        abortSignal,
        headers,
        pronunciations: options.pronunciations,
      });
    }
    return streamFn({
      modelId: resolved.modelId,
      text: textToSend,
      voice,
      providerOptions,
      abortSignal,
      headers,
    });
  }, buildRetryOptions({ maxRetries, abortSignal }));

  const ttfbMs = Math.round(performance.now() - startTime);

  const metadata: SpeechMetadata = {
    latencyMs: ttfbMs,
    ttfbMs,
    inputChars: textToSend.length,
    ...(result.audioDurationMs != null && {
      audioDurationMs: result.audioDurationMs,
    }),
  };

  return {
    audio: result.stream,
    mediaType: result.mediaType,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
