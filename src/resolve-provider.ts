import { SpeechGatewayProvider } from "./providers/gateway/index.js";
import type { ResolvedModel } from "./speech-provider.js";

function isResolvedModel(model: unknown): model is ResolvedModel {
  return (
    model != null &&
    typeof model === "object" &&
    "provider" in model &&
    "modelId" in model
  );
}

export function resolveModel(
  model: string | ResolvedModel,
  options?: { apiKey?: string }
): ResolvedModel {
  if (isResolvedModel(model)) {
    return model;
  }

  if (!model) {
    throw new Error(
      'A model is required. Pass a "provider/model" string (e.g., "openai/gpt-4o-mini-tts") to route through Speech Gateway, or a ResolvedModel from a factory like createOpenAI()().'
    );
  }
  // Bare `"provider/model"` strings route through the speech gateway; direct provider access requires a ResolvedModel from the factory.
  const config = options?.apiKey ? { apiKey: options.apiKey } : {};
  const provider = new SpeechGatewayProvider(config);
  return {
    provider,
    modelId: model,
  };
}
