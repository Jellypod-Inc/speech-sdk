import { InstructionsUnsupportedError } from "./errors.js";
import {
  FEATURES,
  hasFeature,
  isSpeechGatewayModel,
  type ResolvedModel,
} from "./speech-provider.js";

export function nonEmptyInstructions(
  instructions: string | undefined
): string | undefined {
  return instructions?.trim() ? instructions : undefined;
}

export function combineInstructions(
  first: string | undefined,
  second: string | undefined
): string | undefined {
  const parts = [
    nonEmptyInstructions(first),
    nonEmptyInstructions(second),
  ].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

export function validateInstructionSupport(
  resolved: ResolvedModel,
  instructions: string | undefined
): string | undefined {
  const normalized = nonEmptyInstructions(instructions);
  if (!normalized || isSpeechGatewayModel(resolved)) {
    return normalized;
  }

  const model = resolved.provider.models.find(
    (candidate) => candidate.id === resolved.modelId
  );
  if (!(model && hasFeature(model, FEATURES.INSTRUCTIONS))) {
    throw new InstructionsUnsupportedError(
      `${resolved.provider.id}/${resolved.modelId}`
    );
  }
  return normalized;
}
