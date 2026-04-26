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

  // Bare `"provider/model"` strings route through the speech gateway; direct provider access requires a ResolvedModel from the factory.
  const config = options?.apiKey ? { apiKey: options.apiKey } : {};
  const provider = new SpeechGatewayProvider(config);
  return {
    provider,
    modelId: model || provider.defaultModel,
  };
}
