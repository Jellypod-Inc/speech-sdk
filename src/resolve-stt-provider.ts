import { SpeechSDKError } from "./errors.js";
import { parseProviderModelSpec } from "./provider-utils.js";
import type {
  ResolvedSTTModel,
  SpeechToTextProvider,
} from "./speech-to-text-provider.js";
import { OpenAISpeechToTextProvider } from "./stt-providers/openai/index.js";

function isResolvedSTTModel(model: unknown): model is ResolvedSTTModel {
  return (
    model != null &&
    typeof model === "object" &&
    "provider" in model &&
    "modelId" in model &&
    typeof (model as { provider?: { transcribe?: unknown } }).provider
      ?.transcribe === "function"
  );
}

function createBuiltinSTTProvider(
  name: string,
  options?: { apiKey?: string }
): SpeechToTextProvider {
  const config = options?.apiKey ? { apiKey: options.apiKey } : {};
  switch (name) {
    case "openai":
      return new OpenAISpeechToTextProvider(config);
    default:
      throw new SpeechSDKError(`Unknown STT provider: ${name}`);
  }
}

export function resolveSTTModel(
  model: string | ResolvedSTTModel,
  options?: { apiKey?: string }
): ResolvedSTTModel {
  if (isResolvedSTTModel(model)) {
    return model;
  }

  const { providerName, modelId } = parseProviderModelSpec(model);
  const provider = createBuiltinSTTProvider(providerName, options);
  return {
    provider,
    modelId: modelId ?? provider.defaultModel,
  };
}
