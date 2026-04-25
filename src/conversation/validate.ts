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

  for (let i = 0; i < options.turns.length; i++) {
    const turn = options.turns[i];
    if (turn.text.trim().length === 0) {
      throw new ConversationInputError(`turns[${i}].text must not be empty.`);
    }
    if (options.model == null && turn.model == null) {
      throw new ConversationInputError(
        `turns[${i}]: model must be set, either at top-level or on the turn.`
      );
    }
  }
}
