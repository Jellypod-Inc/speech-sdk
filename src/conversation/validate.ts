import { ConversationInputError } from "./errors.js";
import type { ConversationTurn, GenerateConversationOptions } from "./types.js";

// Object voices key by reference — distinct buffers with identical content must not collide.
export function voiceKey(
  voice: ConversationTurn["voice"],
  refIds: WeakMap<object, number>,
  refCounter: { next: number }
): string {
  if (typeof voice === "string") {
    return `s:${voice}`;
  }
  if ("url" in voice) {
    return `u:${voice.url}`;
  }
  if ("audio" in voice && typeof voice.audio === "string") {
    return `a:${voice.audio}`;
  }
  let id = refIds.get(voice);
  if (id === undefined) {
    id = refCounter.next++;
    refIds.set(voice, id);
  }
  return `o:${id}`;
}

export function newVoiceKeyContext(): {
  refIds: WeakMap<object, number>;
  refCounter: { next: number };
} {
  return { refIds: new WeakMap(), refCounter: { next: 0 } };
}

export function validateConversationInput(
  options: GenerateConversationOptions
): void {
  if (options.turns.length === 0) {
    throw new ConversationInputError(
      "generateConversation requires at least one turn."
    );
  }

  // Model placement is all-or-nothing: either set `options.model` for every
  // turn, or set `model` on every turn — but never mix. A partial mix
  // (top-level + per-turn override on some turns) makes the dispatch surface
  // ambiguous and hides which model actually ran where.
  const hasTopLevel = options.model != null;

  for (let i = 0; i < options.turns.length; i++) {
    const turn = options.turns[i];
    if (turn.text.trim().length === 0) {
      throw new ConversationInputError(`turns[${i}].text must not be empty.`);
    }
    const hasTurnModel = turn.model != null;
    if (hasTopLevel && hasTurnModel) {
      throw new ConversationInputError(
        `turns[${i}].model is set, but options.model is also set. Set the model either at the top level for all turns, or on every turn — not both.`
      );
    }
    if (!(hasTopLevel || hasTurnModel)) {
      throw new ConversationInputError(
        `turns[${i}].model is required because options.model is not set. Either set options.model for all turns, or set model on every turn.`
      );
    }
  }
}
