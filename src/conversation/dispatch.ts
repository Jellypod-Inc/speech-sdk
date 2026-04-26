import {
  isSpeechGatewayModel,
  type ResolvedModel,
  type StitchTurnOptions,
  type Voice,
} from "../speech-provider.js";
import {
  DialogueConstraintError,
  MixedDispatchError,
  StitchUnsupportedError,
} from "./errors.js";
import type { ConversationTurn } from "./types.js";
import { newVoiceKeyer } from "./validate.js";

export type ConversationPath =
  | { kind: "gateway"; resolvedPerTurn: readonly ResolvedModel<Voice>[] }
  | { kind: "native"; resolved: ResolvedModel<Voice> }
  | { kind: "stitch"; stitchOptionsPerTurn: readonly StitchTurnOptions[] };

export function chooseConversationPath(input: {
  resolvedPerTurn: readonly ResolvedModel<Voice>[];
  turns: readonly ConversationTurn<Voice>[];
}): ConversationPath {
  const { resolvedPerTurn, turns } = input;

  // Gateway and direct-provider routing can't be combined in one conversation — no coherent ordering/stitching exists across both paths.
  const gatewayCount = resolvedPerTurn.filter(isSpeechGatewayModel).length;
  if (gatewayCount > 0 && gatewayCount < resolvedPerTurn.length) {
    throw new MixedDispatchError();
  }

  // Gateway wire takes string voices only; clone voices (`{url}`/`{audio}`) on gateway models fall past every other branch and throw StitchUnsupportedError below.
  if (gatewayCount === resolvedPerTurn.length) {
    const allVoicesString = turns.every((t) => typeof t.voice === "string");
    if (allVoicesString) {
      return { kind: "gateway", resolvedPerTurn };
    }
  }

  // Compare by provider instance reference so two factories with different apiKey/baseURL/fetch configs aren't silently merged.
  const first = resolvedPerTurn[0];
  const allSame = resolvedPerTurn.every(
    (r) => r.provider === first.provider && r.modelId === first.modelId
  );

  if (allSame) {
    const { provider, modelId } = first;
    if (provider.generateDialogue && provider.dialogueCapabilities) {
      const caps = provider.dialogueCapabilities(modelId);
      if (caps) {
        assertNativeConstraints({ provider, modelId, caps, turns });
        return { kind: "native", resolved: first };
      }
    }
  }

  const stitchOptionsPerTurn = resolvedPerTurn.map((r) => {
    const opts = r.provider.getStitchOptions?.(r.modelId);
    if (!opts) {
      throw new StitchUnsupportedError({
        provider: r.provider.id,
        model: r.modelId,
      });
    }
    return opts;
  });
  return { kind: "stitch", stitchOptionsPerTurn };
}

function assertNativeConstraints(args: {
  provider: ResolvedModel["provider"];
  modelId: string;
  caps: { minVoices: number; maxVoices: number; maxTotalChars?: number };
  turns: readonly ConversationTurn<Voice>[];
}): void {
  const { provider, modelId, caps, turns } = args;

  const keyOf = newVoiceKeyer();
  const unique = new Set(turns.map((t) => keyOf(t.voice))).size;

  if (unique < caps.minVoices || unique > caps.maxVoices) {
    const rule =
      caps.minVoices === caps.maxVoices
        ? `exactly ${caps.minVoices} unique voices`
        : `between ${caps.minVoices} and ${caps.maxVoices} unique voices`;
    throw new DialogueConstraintError({
      provider: provider.id,
      model: modelId,
      rule,
      observed: `${unique} unique voices`,
    });
  }

  if (caps.maxTotalChars != null) {
    const total = turns.reduce((n, t) => n + t.text.length, 0);
    if (total > caps.maxTotalChars) {
      throw new DialogueConstraintError({
        provider: provider.id,
        model: modelId,
        rule: `total characters <= ${caps.maxTotalChars}`,
        observed: `${total} characters`,
      });
    }
  }
}
