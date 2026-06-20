import { type AudioOutput, sampleRateHintFrom } from "../audio-output.js";
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

export type StitchFallbackReason =
  | "fallback-from-native"
  | "fallback-from-native-oversized";

export type ConversationPath =
  | { kind: "gateway"; resolvedPerTurn: readonly ResolvedModel<Voice>[] }
  | {
      kind: "native";
      resolved: ResolvedModel<Voice>;
      // When set (length > 1), the conversation exceeds the provider's native
      // per-call limit and is rendered as parallel native-dialogue blocks
      // (each entry is the turn indices for one block) that are stitched together.
      blocks?: readonly (readonly number[])[];
    }
  | {
      kind: "stitch";
      reason?: StitchFallbackReason;
      stitchOptionsPerTurn: readonly StitchTurnOptions[];
    };

export function chooseConversationPath(input: {
  forceStitch?: boolean;
  resolvedPerTurn: readonly ResolvedModel<Voice>[];
  turns: readonly ConversationTurn<Voice>[];
  output?: AudioOutput;
}): ConversationPath {
  const { forceStitch = false, resolvedPerTurn, turns, output } = input;
  const sampleRateHint = sampleRateHintFrom(output);

  // Gateway and direct-provider routing can't be combined in one conversation — no coherent ordering/stitching exists across both paths.
  const gatewayCount = resolvedPerTurn.filter(isSpeechGatewayModel).length;
  if (gatewayCount > 0 && gatewayCount < resolvedPerTurn.length) {
    throw new MixedDispatchError();
  }

  if (gatewayCount === resolvedPerTurn.length) {
    return { kind: "gateway", resolvedPerTurn };
  }

  // Compare by provider instance reference so two factories with different apiKey/baseURL/fetch configs aren't silently merged.
  const first = resolvedPerTurn[0];
  const allSame = resolvedPerTurn.every(
    (r) => r.provider === first.provider && r.modelId === first.modelId
  );

  let stitchFallbackReason: StitchFallbackReason | undefined;

  if (allSame && !forceStitch) {
    const native = tryNativeDialoguePath({ first, turns, sampleRateHint });
    if (native) {
      if ("path" in native) {
        return native.path;
      }
      stitchFallbackReason = native.fallbackReason;
    }
  }

  const stitchOptionsPerTurn = resolvedPerTurn.map((r) => {
    const opts = r.provider.getStitchOptions?.(r.modelId, {
      sampleRate: sampleRateHint,
    });
    if (!opts) {
      throw new StitchUnsupportedError({
        provider: r.provider.id,
        model: r.modelId,
      });
    }
    return opts;
  });
  return {
    kind: "stitch",
    ...(stitchFallbackReason && { reason: stitchFallbackReason }),
    stitchOptionsPerTurn,
  };
}

interface DialogueCaps {
  maxTotalChars?: number;
  maxVoices: number;
  minVoices: number;
}

// Native dialogue is a single API call that can't carry per-utterance config. Any per-turn
// providerOptions force stitch — and stitch isn't bound by native voice-count / maxTotalChars
// limits, so those checks are skipped on the fallback. Returns the chosen native path, the
// reason it can't be native, or undefined when the provider isn't native-dialogue capable.
function tryNativeDialoguePath(args: {
  first: ResolvedModel<Voice>;
  turns: readonly ConversationTurn<Voice>[];
  sampleRateHint: number | undefined;
}):
  | { path: ConversationPath }
  | { fallbackReason: StitchFallbackReason }
  | undefined {
  const { first, turns, sampleRateHint } = args;
  const { provider, modelId } = first;
  if (!(provider.generateDialogue && provider.dialogueCapabilities)) {
    return;
  }
  const caps = provider.dialogueCapabilities(modelId);
  if (!caps) {
    return;
  }
  if (turns.some((t) => t.providerOptions !== undefined)) {
    return { fallbackReason: "fallback-from-native" };
  }
  // Voice-count is a hard semantic constraint — splitting can't satisfy it, so still throw.
  assertNativeVoiceCount({ provider, modelId, caps, turns });
  const blocks = planNativeBlocks({
    provider,
    modelId,
    caps,
    turns,
    sampleRateHint,
  });
  if (blocks === "single") {
    return { path: { kind: "native", resolved: first } };
  }
  if (blocks) {
    return { path: { kind: "native", resolved: first, blocks } };
  }
  // Over the native limit but can't be split into decodable, voice-valid blocks — render per-turn.
  return { fallbackReason: "fallback-from-native-oversized" };
}

function assertNativeVoiceCount(args: {
  provider: ResolvedModel["provider"];
  modelId: string;
  caps: DialogueCaps;
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
}

// "single" → fits in one native call; number[][] → split into parallel blocks;
// undefined → over the limit but can't be split into decodable, voice-valid blocks (caller falls back to stitch).
function planNativeBlocks(args: {
  provider: ResolvedModel["provider"];
  modelId: string;
  caps: DialogueCaps;
  turns: readonly ConversationTurn<Voice>[];
  sampleRateHint: number | undefined;
}): "single" | readonly (readonly number[])[] | undefined {
  const { provider, modelId, caps, turns, sampleRateHint } = args;

  const max = caps.maxTotalChars;
  const total = turns.reduce((n, t) => n + t.text.length, 0);
  if (max == null || total <= max) {
    return "single";
  }

  // Splitting decodes each block's audio to PCM to stitch — impossible without a decodable wire format.
  const canDecode = provider.getStitchOptions?.(modelId, {
    sampleRate: sampleRateHint,
  });
  if (!canDecode) {
    return;
  }

  return partitionTurnsByChars({ caps, turns, max });
}

function partitionTurnsByChars(args: {
  caps: DialogueCaps;
  turns: readonly ConversationTurn<Voice>[];
  max: number;
}): readonly (readonly number[])[] | undefined {
  const { caps, turns, max } = args;
  const keyOf = newVoiceKeyer();

  // Greedy, not optimal: a maximal front-packed split can strand a sub-minVoices block where a
  // boundary-repositioning split would succeed. Returning undefined here just defers to the per-turn
  // stitch path (correct audio, not native-parallel), so we accept the rare miss over a DP partition.
  const blocks: number[][] = [];
  let current: number[] = [];
  let currentChars = 0;

  for (let i = 0; i < turns.length; i++) {
    const len = turns[i].text.length;
    // A single turn longer than the native limit can't fit any block at turn granularity.
    if (len > max) {
      return;
    }
    if (current.length > 0 && currentChars + len > max) {
      blocks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(i);
    currentChars += len;
  }
  if (current.length > 0) {
    blocks.push(current);
  }

  // Every block must independently satisfy the provider's unique-voice rule (e.g. a long
  // single-speaker run could fill a block on a min-2-voice model — that can't render natively).
  for (const block of blocks) {
    const unique = new Set(block.map((i) => keyOf(turns[i].voice))).size;
    if (unique < caps.minVoices || unique > caps.maxVoices) {
      return;
    }
  }

  return blocks.length > 1 ? blocks : undefined;
}
