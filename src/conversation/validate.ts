import { ConversationInputError } from "./errors.js";
import type { ConversationTurn, GenerateConversationOptions } from "./types.js";

// Object voices key by reference — distinct buffers with identical content must not collide.
export function newVoiceKeyer(): (voice: ConversationTurn["voice"]) => string {
  const refIds = new WeakMap<object, number>();
  let nextId = 0;
  return (voice) => {
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
      id = nextId++;
      refIds.set(voice, id);
    }
    return `o:${id}`;
  };
}

export function validateConversationInput(
  options: GenerateConversationOptions
): void {
  if (options.turns.length === 0) {
    throw new ConversationInputError(
      "generateConversation requires at least one turn."
    );
  }

  // Model placement must be all-or-nothing — partial mix hides which model actually ran where.
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
