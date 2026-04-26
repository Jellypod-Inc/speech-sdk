import type { ConversationWordTimestamp } from "./timestamps.js";

export interface TurnTimestamp {
  readonly end: number;
  readonly start: number;
  readonly text: string;
  readonly turnIndex: number;
}

interface MutableTurnTimestamp {
  end: number;
  start: number;
  text: string;
  turnIndex: number;
}

// Collapse a flat ConversationWordTimestamp[] into one entry per turn —
// merging consecutive words that share the same turnIndex into a single
// { turnIndex, start, end, text }. Assumes timestamps are monotonic across
// turns (the order generateConversation returns them in); two non-adjacent
// runs of the same turnIndex would produce two entries.
export function timestampsToTurns(
  timestamps: readonly ConversationWordTimestamp[]
): readonly TurnTimestamp[] {
  const turns: MutableTurnTimestamp[] = [];
  for (const word of timestamps) {
    const last = turns.at(-1);
    if (last && last.turnIndex === word.turnIndex) {
      last.end = word.end;
      last.text = `${last.text} ${word.text}`;
    } else {
      turns.push({
        turnIndex: word.turnIndex,
        start: word.start,
        end: word.end,
        text: word.text,
      });
    }
  }
  return turns;
}
