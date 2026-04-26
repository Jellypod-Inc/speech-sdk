import type { ConversationWordTimestamp } from "./timestamps.js";

export interface TurnTimestamp {
  readonly end: number;
  readonly start: number;
  readonly text: string;
  readonly turnIndex: number;
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// Assumes turnIndex runs are monotonic; non-adjacent runs of the same turnIndex would produce duplicate entries.
export function timestampsToTurns(
  timestamps: readonly ConversationWordTimestamp[]
): readonly TurnTimestamp[] {
  const turns: Mutable<TurnTimestamp>[] = [];
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
