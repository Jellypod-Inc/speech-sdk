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

const VTT_ESCAPE_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/&/g, "&amp;"],
  [/</g, "&lt;"],
  [/>/g, "&gt;"],
];

/**
 * Escapes characters that would otherwise be interpreted as inline WebVTT
 * markup. Applied only to the VTT render path; SRT passes raw text through.
 * Exported for testing; not part of the public API.
 */
export function escapeVttText(text: string): string {
  let out = text;
  for (const [pattern, replacement] of VTT_ESCAPE_MAP) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function formatTimestamp(seconds: number, separator: "," | "."): string {
  const clamped = Math.max(0, seconds);
  const totalMs = Math.round(clamped * MS_PER_SECOND);
  const ms = totalMs % MS_PER_SECOND;
  const totalSeconds = Math.floor(totalMs / MS_PER_SECOND);
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE
  );
  const secs = totalSeconds % SECONDS_PER_MINUTE;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}${separator}${String(ms).padStart(3, "0")}`;
}

/**
 * Formats a number of seconds as an SRT timestamp: `HH:MM:SS,mmm`.
 * Negative inputs are clamped to zero. Milliseconds are rounded.
 * Exported for testing; not part of the public API.
 */
export function formatSrtTime(seconds: number): string {
  return formatTimestamp(seconds, ",");
}

/**
 * Formats a number of seconds as a WebVTT timestamp: `HH:MM:SS.mmm`.
 * Negative inputs are clamped to zero. Milliseconds are rounded.
 * Exported for testing; not part of the public API.
 */
export function formatVttTime(seconds: number): string {
  return formatTimestamp(seconds, ".");
}

// Sentence-ending punctuation across major writing systems:
//   ASCII:       . ! ?
//   CJK:         。 ！ ？    (U+3002, U+FF01, U+FF1F)
//   Devanagari:  । ॥        (U+0964 danda, U+0965 double danda)
//   Arabic:      ؟ ۔        (U+061F question, U+06D4 full stop)
// Optionally followed by a closing quote: ASCII, curly, or CJK corner bracket.
const SENTENCE_TERMINATOR =
  /[.!?\u3002\uFF01\uFF1F\u0964\u0965\u061F\u06D4]["'\u2018\u2019\u201C\u201D\u300D\u300F]?$/;

/**
 * Groups a flat list of word timestamps into sentences using terminator
 * punctuation attached to the trailing word. Supported terminators:
 *
 * - ASCII: `.`, `!`, `?`
 * - CJK: `。`, `！`, `？`
 * - Devanagari (Hindi, Sanskrit, Marathi): `।`, `॥`
 * - Arabic: `؟`, `۔`
 *
 * A trailing closing quote (`"`, `'`, curly variants, or CJK corner
 * bracket `」` / `』`) attached to the terminator is tolerated.
 *
 * Known limitations:
 * - Abbreviations like "Dr." or "e.g." are treated as sentence ends.
 * - Thai and other scripts without word-level whitespace or inline
 *   terminators fall through to char/duration-based hard breaks.
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

// Comma-equivalent soft-break punctuation: ASCII, CJK ideographic (`、`) and
// fullwidth (`，`), and Arabic (`،`).
const COMMA_TERMINATOR =
  /[,\u3001\uFF0C\u060C]["'\u2018\u2019\u201C\u201D\u300D\u300F]?$/;

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
    const exceedsDuration = cueDurationMs(tentative) > options.maxCueDurationMs;

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

/**
 * Supported caption output formats.
 *
 * - `"srt"` — SubRip (`.srt`). Comma-decimal timestamps, numeric cue IDs,
 *   plain text bodies. Widely supported by media players and upload tools.
 * - `"vtt"` — WebVTT (`.vtt`). Period-decimal timestamps, `WEBVTT` header,
 *   HTML-escaped bodies (`&`, `<`, `>`). Required for HTML `<track>`.
 */
export type CaptionFormat = "srt" | "vtt";

/**
 * Options for {@link timestampsToCaptions}.
 */
export interface CaptionsOptions {
  /** Output format. Default `"srt"`. */
  readonly format?: CaptionFormat;
  /**
   * Minimum cue-char-count at which a trailing comma triggers a soft cue
   * break. Prevents tiny fragments after every comma. Default `60`.
   */
  readonly longPhraseCommaBreakChars?: number;
  /** Max total chars per cue. Default `maxLineLength * maxLinesPerCue`. */
  readonly maxCharsPerCue?: number;
  /** Max cue duration in milliseconds. Default `7000`. */
  readonly maxCueDurationMs?: number;
  /**
   * Max chars per line (word-boundary wrap). Default `42` — the common
   * broadcast convention for Latin-alphabet subtitles.
   *
   * Character counts use JavaScript `string.length` (UTF-16 code units).
   * For CJK (Japanese, Chinese, Korean) content, each character is roughly
   * twice the visual width of an ASCII character in monospaced players;
   * pass a smaller value (e.g. `16`) to match Japanese broadcast norms.
   */
  readonly maxLineLength?: number;
  /** Max lines per cue. Default `2`. */
  readonly maxLinesPerCue?: number;
}

const DEFAULT_MAX_LINE_LENGTH = 42;
const DEFAULT_MAX_LINES_PER_CUE = 2;
const DEFAULT_MAX_CUE_DURATION_MS = 7000;
const DEFAULT_LONG_PHRASE_COMMA_BREAK_CHARS = 60;

function identity(text: string): string {
  return text;
}

/**
 * Converts word-level timestamps into a caption string in SRT or WebVTT
 * format.
 *
 * Sentence boundaries (`.`, `!`, `?` in word text, optionally followed
 * by a closing quote) create cue breaks; long sentences are subdivided
 * by character count, duration, and soft comma breaks. Each cue is
 * greedily wrapped into up to `maxLinesPerCue` lines of `maxLineLength`
 * characters.
 *
 * Returns the empty string for empty input.
 *
 * @example
 * ```ts
 * const { timestamps } = await generateSpeech({ ... });
 *
 * const srt = timestampsToCaptions(timestamps ?? []);
 * const vtt = timestampsToCaptions(timestamps ?? [], { format: "vtt" });
 * ```
 */
export function timestampsToCaptions(
  timestamps: readonly WordTimestamp[],
  options: CaptionsOptions = {}
): string {
  if (timestamps.length === 0) {
    return "";
  }

  const format: CaptionFormat = options.format ?? "srt";
  const maxLineLength = options.maxLineLength ?? DEFAULT_MAX_LINE_LENGTH;
  const maxLinesPerCue = options.maxLinesPerCue ?? DEFAULT_MAX_LINES_PER_CUE;
  const maxCharsPerCue =
    options.maxCharsPerCue ?? maxLineLength * maxLinesPerCue;
  const maxCueDurationMs =
    options.maxCueDurationMs ?? DEFAULT_MAX_CUE_DURATION_MS;
  const longPhraseCommaBreakChars =
    options.longPhraseCommaBreakChars ?? DEFAULT_LONG_PHRASE_COMMA_BREAK_CHARS;

  const sentences = groupIntoSentences(timestamps);
  const cues: WordTimestamp[][] = [];
  for (const sentence of sentences) {
    cues.push(
      ...splitSentenceIntoCues(sentence, {
        maxCharsPerCue,
        maxCueDurationMs,
        longPhraseCommaBreakChars,
      })
    );
  }

  const formatTime = format === "vtt" ? formatVttTime : formatSrtTime;
  const escapeText = format === "vtt" ? escapeVttText : identity;

  const blocks: string[] = [];
  if (format === "vtt") {
    blocks.push("WEBVTT\n");
  }

  let index = 1;
  for (const cue of cues) {
    if (cue.length === 0) {
      continue;
    }
    const normalizedWords = cue.map((wt) =>
      escapeText(normalizeTypography(wt.text))
    );
    const body = wrapCueText(normalizedWords, {
      maxLineLength,
      maxLines: maxLinesPerCue,
    });
    const first = cue[0];
    const last = cue.at(-1);
    if (!last) {
      continue;
    }
    blocks.push(
      `${index}\n${formatTime(first.start)} --> ${formatTime(last.end)}\n${body}\n`
    );
    index++;
  }

  // Append a trailing newline so the file ends with a blank line after the
  // last cue — required by WebVTT's empty-line-separator rule and the SRT
  // convention that strict parsers (e.g. ffmpeg, browser <track>) expect.
  return `${blocks.join("\n")}\n`;
}
