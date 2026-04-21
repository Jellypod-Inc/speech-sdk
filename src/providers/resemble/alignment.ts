import type { WordTimestamp } from "../../timestamps.js";

/**
 * Shape of the `audio_timestamps` block Resemble's `/synthesize` returns
 * alongside `audio_content`. Two parallel pairs of arrays:
 *
 * - `graph_chars[i]` is the i-th grapheme (Unicode character) — including
 *   spaces and punctuation as standalone entries — and `graph_times[i]` is
 *   its `[start, end]` window in **seconds**.
 * - `phon_chars` / `phon_times` mirror that for ARPAbet phonemes (no spaces
 *   or punctuation), kept here for typing only — the SDK aggregates from
 *   graphemes, which match input characters 1:1.
 */
export interface ResembleAudioTimestamps {
  readonly graph_chars: readonly string[];
  readonly graph_times: readonly (readonly number[])[];
  readonly phon_chars?: readonly string[];
  readonly phon_times?: readonly (readonly number[])[];
}

const WHITESPACE_CHAR = /^\s$/;

/**
 * Aggregate Resemble's grapheme-level timing into word-level timestamps.
 *
 * Algorithm: walk `graph_chars` in order. Whitespace flushes the current
 * word and is dropped. Non-whitespace characters (letters AND punctuation)
 * accumulate into a buffer — punctuation stays attached to its adjacent
 * word ("Hello," is one word) to mirror the ElevenLabs aggregator.
 *
 * Each entry in `graph_times` is `[startSeconds, endSeconds]`; the word
 * inherits the first character's start and the last character's end.
 * Entries with malformed timing tuples are skipped to avoid NaN bleed.
 */
export function audioTimestampsToWordTimestamps(
  alignment: ResembleAudioTimestamps
): WordTimestamp[] {
  const chars = alignment.graph_chars;
  const times = alignment.graph_times;
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

    const t = times[i];
    if (!t || t.length < 2) {
      continue;
    }
    const s = t[0];
    const e = t[1];
    if (!(Number.isFinite(s) && Number.isFinite(e))) {
      continue;
    }

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
