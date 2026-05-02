import { SENTENCE_TERMINATOR_RE } from "./sentence-boundaries.js";
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

// Strip C0 controls (excluding whitespace) + DEL — some parsers truncate on NUL.
// biome-ignore lint/suspicious/noControlCharactersInRegex: intentional — this regex exists to strip control characters
const CONTROL_CHARS = /[\u0000-\u0008\u000E-\u001F\u007F]/g;

const WHITESPACE_RUN = /\s+/g;

export function normalizeTypography(text: string): string {
  let out = text.replace(CONTROL_CHARS, "");
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

export function formatSrtTime(seconds: number): string {
  return formatTimestamp(seconds, ",");
}

export function formatVttTime(seconds: number): string {
  return formatTimestamp(seconds, ".");
}

// Limitations: "Dr."/"e.g." are treated as sentence ends; Thai etc. fall through to char/duration breaks.
export function groupIntoSentences(
  words: readonly WordTimestamp[]
): WordTimestamp[][] {
  const sentences: WordTimestamp[][] = [];
  let current: WordTimestamp[] = [];
  for (const word of words) {
    current.push(word);
    if (SENTENCE_TERMINATOR_RE.test(word.text.trim())) {
      sentences.push(current);
      current = [];
    }
  }
  if (current.length > 0) {
    sentences.push(current);
  }
  return sentences;
}

// Comma-equivalent soft breaks: ASCII + CJK + Arabic.
const COMMA_TERMINATOR =
  /[,\u3001\uFF0C\u060C]["'\u2018\u2019\u201C\u201D\u300D\u300F]?$/;

interface CueSplitOptions {
  readonly longPhraseCommaBreakChars: number;
  readonly maxCharsPerCue: number;
  readonly maxCueDurationMs: number;
}

function cueCharLength(cue: readonly WordTimestamp[]): number {
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

// Break priority: char budget → duration → comma above longPhraseCommaBreakChars.
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

// Words longer than maxLineLength go on their own line; overflow appends to the last line.
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

export type CaptionFormat = "srt" | "vtt";

export interface CaptionsOptions {
  readonly format?: CaptionFormat;
  readonly longPhraseCommaBreakChars?: number;
  readonly maxCharsPerCue?: number;
  readonly maxCueDurationMs?: number;
  // Default 42 (Latin broadcast norm). UTF-16 code units — pass ~16 for CJK.
  readonly maxLineLength?: number;
  readonly maxLinesPerCue?: number;
}

const DEFAULT_MAX_LINE_LENGTH = 42;
const DEFAULT_MAX_LINES_PER_CUE = 2;
const DEFAULT_MAX_CUE_DURATION_MS = 7000;
const DEFAULT_LONG_PHRASE_COMMA_BREAK_CHARS = 60;

function identity(text: string): string {
  return text;
}

export function timestampsToCaptions(
  timestamps: readonly WordTimestamp[],
  options: CaptionsOptions = {}
): string {
  const format: CaptionFormat = options.format ?? "srt";

  if (timestamps.length === 0) {
    // WebVTT requires the WEBVTT header per W3C §3.1, even with zero cues.
    return format === "vtt" ? "WEBVTT\n\n" : "";
  }

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

  // Trailing blank line required by WebVTT and expected by strict SRT parsers.
  return `${blocks.join("\n")}\n`;
}
