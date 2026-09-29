import { resolveModel } from "./resolve-provider.js";
import type { ResolvedModel } from "./speech-provider.js";

export interface DialogueLimits {
  maxTotalChars?: number;
  maxVoices: number;
  streaming: boolean;
}

/**
 * Native-dialogue limits for a model, or `undefined` when it has no native dialogue.
 * `generateConversation` splits past `maxTotalChars` (seams at block boundaries) and `streamConversation` throws.
 */
export function getDialogueLimits(
  model: string | ResolvedModel
): DialogueLimits | undefined {
  const { provider, modelId } = resolveModel(model);
  const caps = provider.dialogueCapabilities?.(modelId);
  if (!(provider.generateDialogue && caps)) {
    return;
  }
  return {
    maxVoices: caps.maxVoices,
    ...(caps.maxTotalChars != null && { maxTotalChars: caps.maxTotalChars }),
    streaming: caps.streaming === true,
  };
}
