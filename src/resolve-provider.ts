import type { ResolvedModel } from './speech-provider.js';
import { SpeechSDKError } from './errors.js';

function isResolvedModel(model: unknown): model is ResolvedModel {
  return (
    model != null &&
    typeof model === 'object' &&
    'provider' in model &&
    'modelId' in model
  );
}

export function resolveModel(
  model: string | ResolvedModel,
): ResolvedModel {
  if (isResolvedModel(model)) {
    return model;
  }

  throw new SpeechSDKError(
    `String model identifiers like "${model}" are not supported yet. ` +
    `Use a provider factory instead:\n\n` +
    `  import { createOpenAI } from '@jellypod/speech-sdk/openai';\n` +
    `  const openai = createOpenAI();\n` +
    `  generateSpeech({ model: openai('tts-1'), ... })`,
  );
}
