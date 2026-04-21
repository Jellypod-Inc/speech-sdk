import type { WordTimestamp } from "./timestamps.js";

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;

const TYPOGRAPHY_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/\u2019/g, "'"],
  [/\u2018/g, "'"],
  [/\u201C/g, '"'],
  [/\u201D/g, '"'],
  [/\u2013/g, "-"],
  [/\u2014/g, "-"],
  [/\u2026/g, "..."],
];

const WHITESPACE_RUN = /\s+/g;

/**
 * Sanitizes non-ASCII typography characters to ASCII equivalents and
 * collapses whitespace runs. Exported for testing.
 */
export function normalizeTypography(text: string): string {
  let out = text;
  for (const [pattern, replacement] of TYPOGRAPHY_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(WHITESPACE_RUN, " ");
}

/**
 * Formats a number of seconds as an SRT timestamp: `HH:MM:SS,mmm`.
 * Negative inputs are clamped to zero. Milliseconds are rounded.
 * Exported for testing; not part of the public API.
 */
export function formatSrtTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const totalMs = Math.round(clamped * MS_PER_SECOND);
  const ms = totalMs % MS_PER_SECOND;
  const totalSeconds = Math.floor(totalMs / MS_PER_SECOND);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  );
  const secs = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

// Matches a word ending in .!? optionally followed by a single closing quote.
const SENTENCE_TERMINATOR = /[.!?]["']?$/;

/**
 * Groups a flat list of word timestamps into sentences using
 * terminator punctuation (`.`, `!`, `?`, optionally followed by a
 * closing quote) attached to the trailing word.
 *
 * Known limitation: abbreviations like "Dr." or "e.g." are treated as
 * sentence ends. Acceptable for v1 captioning.
 *
 * Exported for testing; not part of the public API.
 */
export function groupIntoSentences(
  words: readonly WordTimestamp[]
): WordTimestamp[][] {
  const sentences: WordTimestamp[][] = [];
  let current: WordTimestamp[] = [];
  for (const word of words) {
    current.push(word);
    if (SENTENCE_TERMINATOR.test(word.text.trim())) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    sentences.push(current);
  }
  return sentences;
}
