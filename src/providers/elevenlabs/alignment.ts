import type { WordTimestamp } from "../../timestamps.js";

/**
 * Shape of the `alignment` / `normalized_alignment` object ElevenLabs returns
 * from `/v1/text-to-speech/{voice_id}/with-timestamps`.
 *
 * Three parallel arrays — `characters[i]` was spoken from
 * `character_start_times_seconds[i]` to `character_end_times_seconds[i]`.
 */
export interface ElevenLabsAlignment {
  readonly character_end_times_seconds: readonly number[];
  readonly character_start_times_seconds: readonly number[];
  readonly characters: readonly string[];
}

const WHITESPACE_CHAR = /^\s$/;

/**
 * Aggregates ElevenLabs character-level alignment into word-level timestamps
 * by splitting on whitespace. Non-whitespace runs become words; the word's
 * start is the first char's start time, the end is the last char's end time.
 *
 * Prefer `normalized_alignment` when the input contains numbers or
 * abbreviations — ElevenLabs expands those during synthesis ("$5" → "five
 * dollars"), and normalized alignment matches what was actually spoken.
 */
export function alignmentToWordTimestamps(
  alignment: ElevenLabsAlignment
): WordTimestamp[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  if (chars.length === 0) {
    return [];
  }

  const words: WordTimestamp[] = [];
  let buf = "";
  let wordStart = 0;
  let wordEnd = 0;
  let inWord = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const isWs = WHITESPACE_CHAR.test(c);

    if (isWs) {
      if (inWord) {
        words.push({ text: buf, start: wordStart, end: wordEnd });
        buf = "";
        inWord = false;
      }
      continue;
    }

    const s = starts[i] ?? 0;
    const e = ends[i] ?? s;
    if (!inWord) {
      wordStart = s;
      inWord = true;
    }
    buf += c;
    wordEnd = e;
  }

  if (inWord && buf.length > 0) {
    words.push({ text: buf, start: wordStart, end: wordEnd });
  }

  return words;
}
