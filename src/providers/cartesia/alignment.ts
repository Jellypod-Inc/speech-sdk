import type { WordTimestamp } from "../../timestamps.js";

// Cartesia `type: "timestamps"` payload — three parallel arrays, times in seconds.
export interface CartesiaWordTimestamps {
  readonly end: readonly number[];
  readonly start: readonly number[];
  readonly words: readonly string[];
}

// Skips past the shortest array length to guard against malformed messages.
export function mergeWordTimestampMessages(
  messages: readonly CartesiaWordTimestamps[]
): WordTimestamp[] {
  const out: WordTimestamp[] = [];
  for (const msg of messages) {
    const len = Math.min(msg.words.length, msg.start.length, msg.end.length);
    for (let i = 0; i < len; i++) {
      const text = msg.words[i];
      const start = msg.start[i];
      const end = msg.end[i];
      if (text == null || start == null || end == null) {
        continue;
      }
      out.push({ text, start, end });
    }
  }
  return out;
}
