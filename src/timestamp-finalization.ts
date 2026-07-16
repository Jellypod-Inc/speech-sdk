import type { WordTimestamp } from "./timestamps.js";

const CANONICAL_CHARACTERS = /[\p{L}\p{M}\p{N}]/gu;
const LEXICAL_CHARACTER = /[\p{L}\p{N}]/u;
const NON_WHITESPACE_RUN = /\S+/gu;
const TIMING_EPSILON_SECONDS = 1e-6;

interface SourceToken {
  readonly canonical: string;
  readonly text: string;
}

export type TimestampFinalizationResult =
  | {
      readonly ok: true;
      readonly timestamps: readonly WordTimestamp[];
    }
  | {
      readonly ok: false;
      readonly reason: TimestampRejectionReason;
    };

export type TimestampRejectionReason =
  | "empty"
  | "invalid_timing"
  | "transcript_mismatch";

function canonicalize(text: string): string {
  return (
    text.normalize("NFC").toLowerCase().match(CANONICAL_CHARACTERS) ?? []
  ).join("");
}

function tokenizeSource(text: string): readonly SourceToken[] {
  const ranges: { start: number; end: number }[] = [];
  let leadingPunctuationStart: number | undefined;

  for (const match of text.matchAll(NON_WHITESPACE_RUN)) {
    const runText = match[0];
    const start = match.index;
    const end = start + runText.length;

    if (LEXICAL_CHARACTER.test(runText)) {
      ranges.push({ start: leadingPunctuationStart ?? start, end });
      leadingPunctuationStart = undefined;
      continue;
    }

    const previous = ranges.at(-1);
    if (previous) {
      previous.end = end;
    } else {
      leadingPunctuationStart ??= start;
    }
  }

  return ranges.map(({ start, end }) => {
    const tokenText = text.slice(start, end);
    return { canonical: canonicalize(tokenText), text: tokenText };
  });
}

function hasInvalidTiming(
  timestamps: readonly WordTimestamp[],
  audioDurationMs: number | undefined
): boolean {
  const durationSeconds =
    audioDurationMs != null && audioDurationMs > 0
      ? audioDurationMs / 1000
      : undefined;
  const durationTolerance =
    durationSeconds == null
      ? undefined
      : Math.max(0.25, durationSeconds * 0.05);

  let previousEnd = 0;
  for (const [index, timestamp] of timestamps.entries()) {
    if (
      !(Number.isFinite(timestamp.start) && Number.isFinite(timestamp.end)) ||
      timestamp.start < 0 ||
      timestamp.end < 0 ||
      timestamp.end + TIMING_EPSILON_SECONDS < timestamp.start ||
      (index > 0 && timestamp.start + TIMING_EPSILON_SECONDS < previousEnd) ||
      (durationSeconds != null &&
        durationTolerance != null &&
        timestamp.end > durationSeconds + durationTolerance)
    ) {
      return true;
    }
    previousEnd = timestamp.end;
  }
  return false;
}

export function finalizeTimestamps(args: {
  readonly audioDurationMs?: number;
  readonly text: string;
  readonly timestamps: readonly WordTimestamp[];
}): TimestampFinalizationResult {
  const sourceTokens = tokenizeSource(args.text);

  if (sourceTokens.length === 0) {
    return args.timestamps.length === 0
      ? { ok: true, timestamps: [] }
      : { ok: false, reason: "transcript_mismatch" };
  }
  if (args.timestamps.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (
    args.timestamps.some(({ text }) => !LEXICAL_CHARACTER.test(text)) ||
    args.timestamps.some(({ text }) => canonicalize(text).length === 0)
  ) {
    return { ok: false, reason: "transcript_mismatch" };
  }
  if (hasInvalidTiming(args.timestamps, args.audioDurationMs)) {
    return { ok: false, reason: "invalid_timing" };
  }

  const sourceCanonical = sourceTokens
    .map(({ canonical }) => canonical)
    .join("");
  const providerCanonical = args.timestamps
    .map(({ text }) => canonicalize(text))
    .join("");
  if (sourceCanonical !== providerCanonical) {
    return { ok: false, reason: "transcript_mismatch" };
  }

  const providerBoundaries = new Map<number, number>();
  let providerOffset = 0;
  for (const [index, timestamp] of args.timestamps.entries()) {
    providerOffset += [...canonicalize(timestamp.text)].length;
    providerBoundaries.set(providerOffset, index);
  }

  const projected: WordTimestamp[] = [];
  let sourceOffset = 0;
  let firstProviderIndex = 0;
  for (const sourceToken of sourceTokens) {
    sourceOffset += [...sourceToken.canonical].length;
    const lastProviderIndex = providerBoundaries.get(sourceOffset);
    if (lastProviderIndex == null || lastProviderIndex < firstProviderIndex) {
      return { ok: false, reason: "transcript_mismatch" };
    }
    const first = args.timestamps[firstProviderIndex];
    const last = args.timestamps[lastProviderIndex];
    if (!(first && last)) {
      return { ok: false, reason: "transcript_mismatch" };
    }
    projected.push({
      text: sourceToken.text,
      start: first.start,
      end: last.end,
    });
    firstProviderIndex = lastProviderIndex + 1;
  }

  return { ok: true, timestamps: projected };
}
