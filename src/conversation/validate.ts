import { ConversationInputError } from "./errors.js";
import type { ConversationTurn, GenerateConversationOptions } from "./types.js";

const MAX_UNIQUE_VOICES = 4;

/**
 * Stable key for a voice so we can count unique voices across turns within
 * one call. String voices and URL voices use their value; binary
 * `Uint8Array` audio voices use object-reference identity (two distinct
 * buffers with the same length/endpoints would otherwise collide).
 */
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
  // Object voice (Uint8Array audio, or any other shape) — key by reference.
  let id = refIds.get(voice);
  if (id === undefined) {
    id = refCounter.next++;
    refIds.set(voice, id);
  }
  return `o:${id}`;
}

/** Build a fresh ref-id context for a single conversation. */
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

  const ctx = newVoiceKeyContext();
  const uniqueVoices = new Set(
    options.turns.map((t) => voiceKey(t.voice, ctx.refIds, ctx.refCounter))
  );
  if (uniqueVoices.size > MAX_UNIQUE_VOICES) {
    throw new ConversationInputError(
      `generateConversation accepts at most 4 unique voices; got ${uniqueVoices.size}.`
    );
  }
}
