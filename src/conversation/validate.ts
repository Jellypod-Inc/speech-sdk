import { ConversationInputError } from "./errors.js";
import type { ConversationTurn, GenerateConversationOptions } from "./types.js";

export function newVoiceKeyer(): (voice: ConversationTurn["voice"]) => string {
  return (voice) => `s:${voice}`;
}

export function validateTurnTexts(
  turns: readonly Pick<ConversationTurn, "text">[],
  entryPoint: string
): void {
  if (turns.length === 0) {
    throw new ConversationInputError(
      `${entryPoint} requires at least one turn.`
    );
  }
  for (const [i, turn] of turns.entries()) {
    if (turn.text.trim().length === 0) {
      throw new ConversationInputError(`turns[${i}].text must not be empty.`);
    }
  }
}

export function validateConversationInput(
  options: GenerateConversationOptions
): void {
  validateTurnTexts(options.turns, "generateConversation");

  if (options.splitTurns && options.timestamps !== true) {
    throw new ConversationInputError(
      "splitTurns requires timestamps: true — turn boundaries come from word timestamps."
    );
  }

  // Model placement must be all-or-nothing — partial mix hides which model actually ran where.
  const hasTopLevel = options.model != null;

  for (let i = 0; i < options.turns.length; i++) {
    const turn = options.turns[i];
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
