import type { WordTimestamp } from "../../timestamps.js";

/**
 * Shape of the `timestampInfo.wordAlignment` block Inworld returns when
 * `timestamp_type: "WORD"` is set on a synthesis request. The three primary
 * arrays are parallel — index N is the Nth word's text, start, and end.
 *
 * Times are already in **seconds** (not milliseconds) so no unit conversion
 * is needed when projecting into the SDK's `WordTimestamp[]`.
 *
 * `phoneticDetails` is only emitted by the 1.5 family and is unused by the
 * SDK today — kept here for typing only.
 */
export interface InworldWordAlignment {
  readonly phoneticDetails?: readonly unknown[];
  readonly wordEndTimeSeconds: readonly number[];
  readonly wordStartTimeSeconds: readonly number[];
  readonly words: readonly string[];
}

/**
 * Project Inworld's parallel word alignment arrays into the SDK's
 * `WordTimestamp[]`. Skips entries past the shortest array length so a
 * malformed response can't produce undefined start/end values.
 */
export function wordAlignmentToWordTimestamps(
  alignment: InworldWordAlignment
): WordTimestamp[] {
  const len = Math.min(
    alignment.words.length,
    alignment.wordStartTimeSeconds.length,
    alignment.wordEndTimeSeconds.length
  );
  const out: WordTimestamp[] = [];
  for (let i = 0; i < len; i++) {
    const text = alignment.words[i];
    const start = alignment.wordStartTimeSeconds[i];
    const end = alignment.wordEndTimeSeconds[i];
    // Inworld occasionally emits empty-string entries for interstitial
    // silence or punctuation — drop them so the SDK's word list only
    // contains real words.
    if (text == null || start == null || end == null || text.length === 0) {
      continue;
    }
    out.push({ text, start, end });
  }
  return out;
}
