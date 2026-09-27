import { canonicalizeTimestampText } from "../timestamp-finalization.js";
import type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "../timestamps.js";

// Each word's canonical text must sit inside exactly one turn's canonical text, in order; undefined otherwise.
export function attributeTimestamps(args: {
  timestamps: readonly WordTimestamp[];
  turnTexts: readonly string[];
}): readonly ConversationWordTimestamp[] | undefined {
  const turnChars = args.turnTexts.map((t) => [
    ...canonicalizeTimestampText(t),
  ]);
  const joined = turnChars.flat();
  const turnEnds: number[] = [];
  let end = 0;
  for (const chars of turnChars) {
    end += chars.length;
    turnEnds.push(end);
  }

  const out: ConversationWordTimestamp[] = [];
  let position = 0;
  let turnIndex = 0;
  for (const word of args.timestamps) {
    const chars = [...canonicalizeTimestampText(word.text)];
    if (chars.length === 0) {
      return;
    }
    for (const [offset, char] of chars.entries()) {
      if (joined[position + offset] !== char) {
        return;
      }
    }
    while (turnIndex < turnEnds.length && position >= turnEnds[turnIndex]) {
      turnIndex++;
    }
    if (position + chars.length > (turnEnds[turnIndex] ?? 0)) {
      return;
    }
    out.push({ text: word.text, start: word.start, end: word.end, turnIndex });
    position += chars.length;
  }
  return position === joined.length ? out : undefined;
}
