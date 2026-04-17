import type { ResolvedModel, Voice } from "../speech-provider.js";
import { DialogueConstraintError, StitchUnsupportedError } from "./errors.js";
import type { ConversationTurn } from "./types.js";
import { voiceKey } from "./validate.js";

export type ConversationPath =
  | {
      kind: "native";
      provider: ResolvedModel["provider"];
      modelId: string;
    }
  | {
      kind: "stitch";
      stitchOptionsPerTurn: readonly {
        providerOptions: Record<string, unknown>;
        mediaType: string;
      }[];
    };

export function chooseConversationPath(input: {
  resolvedPerTurn: readonly ResolvedModel<Voice>[];
  turns: readonly ConversationTurn<Voice>[];
}): ConversationPath {
  const { resolvedPerTurn, turns } = input;

  const firstKey = `${resolvedPerTurn[0].provider.id}/${resolvedPerTurn[0].modelId}`;
  const allSame = resolvedPerTurn.every(
    (r) => `${r.provider.id}/${r.modelId}` === firstKey
  );

  if (allSame) {
    const { provider, modelId } = resolvedPerTurn[0];
    if (provider.generateDialogue && provider.dialogueCapabilities) {
      const caps = provider.dialogueCapabilities(modelId);
      if (caps) {
        assertNativeConstraints({ provider, modelId, caps, turns });
        return { kind: "native", provider, modelId };
      }
    }
  }

  // Stitch path — every resolved (provider, modelId) must support getStitchOptions.
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

  const unique = new Set(turns.map((t) => voiceKey(t.voice))).size;

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
