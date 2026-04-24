import {
  isSpeechGatewayModel,
  type ResolvedModel,
  type Voice,
} from "../speech-provider.js";
import { DialogueConstraintError, StitchUnsupportedError } from "./errors.js";
import type { ConversationTurn } from "./types.js";
import { newVoiceKeyContext, voiceKey } from "./validate.js";

export type ConversationPath =
  | { kind: "gateway"; resolved: ResolvedModel<Voice> }
  | { kind: "native"; resolved: ResolvedModel<Voice> }
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

  // Compare by provider instance reference, not just provider id, so two
  // factories of the same provider with different apiKey/baseURL/fetch
  // configs are not silently merged into one.
  const first = resolvedPerTurn[0];
  const allSame = resolvedPerTurn.every(
    (r) => r.provider === first.provider && r.modelId === first.modelId
  );

  if (allSame) {
    // Gateway fast-path: one HTTP call to `/v1/audio/conversation`, server
    // does render + stitch + normalize. Preferred when every turn routes to
    // the same gateway-served model. Heterogeneous gateway models (different
    // modelIds) fall through to native → stitch below.
    if (isSpeechGatewayModel(first)) {
      // Gateway accepts every aggregated model on `/v1/audio/conversation`;
      // server handles per-turn rendering for providers without native
      // multi-speaker. Voice clones (`{url}`/`{audio}`) still require stitch
      // — the flat turn wire shape takes string voices only.
      const allVoicesString = turns.every((t) => typeof t.voice === "string");
      if (allVoicesString) {
        return { kind: "gateway", resolved: first };
      }
    }

    const { provider, modelId } = first;
    if (provider.generateDialogue && provider.dialogueCapabilities) {
      const caps = provider.dialogueCapabilities(modelId);
      if (caps) {
        assertNativeConstraints({ provider, modelId, caps, turns });
        return { kind: "native", resolved: first };
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

  const ctx = newVoiceKeyContext();
  const unique = new Set(
    turns.map((t) => voiceKey(t.voice, ctx.refIds, ctx.refCounter))
  ).size;

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
