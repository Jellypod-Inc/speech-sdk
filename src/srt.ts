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

const COMMA_TERMINATOR = /,["']?$/;

interface CueSplitOptions {
  readonly longPhraseCommaBreakChars: number;
  readonly maxCharsPerCue: number;
  readonly maxCueDurationMs: number;
}

function cueCharLength(cue: readonly WordTimestamp[]): number {
  // Sum word lengths + (n-1) spaces between words.
  let chars = 0;
  for (const word of cue) {
    chars += word.text.length;
  }
  if (cue.length > 1) {
    chars += cue.length - 1;
  }
  return chars;
}

function cueDurationMs(cue: readonly WordTimestamp[]): number {
  if (cue.length === 0) {
    return 0;
  }
  const first = cue[0];
  const last = cue.at(-1);
  if (!last) {
    return 0;
  }
  return (last.end - first.start) * 1000;
}

/**
 * Subdivides a sentence (an ordered list of words) into one or more cues.
 * Breaks are chosen in this priority order:
 *   1. Hard: character budget exceeded → break before the offending word.
 *   2. Hard: duration exceeded → break before the offending word.
 *   3. Soft: comma in a word that leaves the current cue above
 *      `longPhraseCommaBreakChars` → break after that word.
 *
 * Exported for testing; not part of the public API.
 */
export function splitSentenceIntoCues(
  sentence: readonly WordTimestamp[],
  options: CueSplitOptions
): WordTimestamp[][] {
  const cues: WordTimestamp[][] = [];
  let current: WordTimestamp[] = [];

  for (const word of sentence) {
    const tentative = [...current, word];
    const exceedsChars = cueCharLength(tentative) > options.maxCharsPerCue;
    const exceedsDuration =
      cueDurationMs(tentative) * 1 > options.maxCueDurationMs;

    if ((exceedsChars || exceedsDuration) && current.length > 0) {
      cues.push(current);
      current = [word];
      continue;
    }

    current.push(word);

    const endsWithComma = COMMA_TERMINATOR.test(word.text.trim());
    if (
      endsWithComma &&
      cueCharLength(current) + 1 >= options.longPhraseCommaBreakChars
    ) {
      cues.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    cues.push(current);
  }

  return cues;
}

interface WrapOptions {
  readonly maxLineLength: number;
  readonly maxLines: number;
}

/**
 * Wraps a sequence of words into up to `maxLines` lines, trying to keep
 * each line at or below `maxLineLength` characters. A word longer than
 * `maxLineLength` is placed on its own line rather than split. If words
 * remain after the final line is full, they are appended to that final
 * line (accept overflow; cue splitter is expected to have prevented this
 * in normal flow).
 *
 * Exported for testing; not part of the public API.
 */
export function wrapCueText(
  words: readonly string[],
  options: WrapOptions
): string {
  if (words.length === 0) {
    return "";
  }
  const lines: string[] = [""];
  for (const word of words) {
    const last = lines.at(-1) ?? "";
    const candidate = last.length === 0 ? word : `${last} ${word}`;
    if (
      candidate.length <= options.maxLineLength ||
      last.length === 0 ||
      lines.length >= options.maxLines
    ) {
      lines[lines.length - 1] = candidate;
    } else {
      lines.push(word);
    }
  }
  return lines.join("\n");
}
