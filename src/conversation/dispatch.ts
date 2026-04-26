import {
  isSpeechGatewayModel,
  type ResolvedModel,
  type Voice,
} from "../speech-provider.js";
import {
  DialogueConstraintError,
  MixedDispatchError,
  StitchUnsupportedError,
} from "./errors.js";
import type { ConversationTurn } from "./types.js";
import { newVoiceKeyContext, voiceKey } from "./validate.js";

export type ConversationPath =
  | { kind: "gateway"; resolvedPerTurn: readonly ResolvedModel<Voice>[] }
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

  // All-or-nothing: gateway and direct-provider routing can't be combined in
  // a single conversation. The gateway path is one HTTP call; the direct path
  // is per-turn provider calls. Mixing them would require splitting one
  // conversation across both, which has no coherent ordering or stitching
  // semantics — fail loudly instead.
  const gatewayCount = resolvedPerTurn.filter(isSpeechGatewayModel).length;
  if (gatewayCount > 0 && gatewayCount < resolvedPerTurn.length) {
    throw new MixedDispatchError();
  }

  // All-gateway: one HTTP call to `/v1/audio/conversation`, server does
  // render + stitch + normalize across heterogeneous models. The wire is
  // per-turn `{model, voice, text}`, so different models per turn are fine.
  // Voice clones (`{url}`/`{audio}`) still fall through to stitch — the flat
  // turn wire shape takes string voices only.
  if (gatewayCount === resolvedPerTurn.length) {
    const allVoicesString = turns.every((t) => typeof t.voice === "string");
    if (allVoicesString) {
      return { kind: "gateway", resolvedPerTurn };
    }
  }

  // Compare by provider instance reference, not just provider id, so two
  // factories of the same provider with different apiKey/baseURL/fetch
  // configs are not silently merged into one.
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
