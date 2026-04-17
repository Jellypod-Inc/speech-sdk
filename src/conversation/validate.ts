import { ConversationInputError } from "./errors.js";
import type { ConversationTurn, GenerateConversationOptions } from "./types.js";

const MAX_UNIQUE_VOICES = 4;

/**
 * Stable string key for a voice so we can count unique voices across turns.
 * Strings are themselves. Object voices use their distinguishing field for
 * stable equality (same URL === same voice).
 */
export function voiceKey(voice: ConversationTurn["voice"]): string {
  if (typeof voice === "string") {
    return `s:${voice}`;
  }
  if ("url" in voice) {
    return `u:${voice.url}`;
  }
  if ("audio" in voice) {
    if (typeof voice.audio === "string") {
      return `a:${voice.audio}`;
    }
    const a = voice.audio;
    return `b:${a.length}:${a[0] ?? 0}:${a[a.length - 1] ?? 0}`;
  }
  return `x:${JSON.stringify(voice)}`;
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

  const uniqueVoices = new Set(options.turns.map((t) => voiceKey(t.voice)));
  if (uniqueVoices.size > MAX_UNIQUE_VOICES) {
    throw new ConversationInputError(
      `generateConversation accepts at most 4 unique voices; got ${uniqueVoices.size}.`
    );
  }
}
