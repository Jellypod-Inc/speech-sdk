import type { WordTimestamp } from "../../timestamps.js";

/**
 * Shape of the `word_timestamps` block inside a Cartesia SSE/WebSocket
 * `type: "timestamps"` message. Three parallel arrays — index N is the Nth
 * word's text (`words[N]`), start time (`start[N]`, seconds), and end time
 * (`end[N]`, seconds).
 *
 * Cartesia emits these messages incrementally — each message covers a span
 * of words synthesized so far in the current `context_id`. The SDK
 * accumulates them in arrival order and flattens at end-of-stream.
 */
export interface CartesiaWordTimestamps {
  readonly end: readonly number[];
  readonly start: readonly number[];
  readonly words: readonly string[];
}

/**
 * Flatten a sequence of `word_timestamps` messages — collected as the SSE
 * stream emitted them — into a single `WordTimestamp[]`. Skips entries past
 * the shortest array length so a malformed message can't produce undefined
 * start/end values.
 */
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
