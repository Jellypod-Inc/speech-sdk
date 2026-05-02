import { z } from "zod";
import { SENTENCE_BOUNDARY_RE } from "./sentence-boundaries.js";

const WHITESPACE_RE = /\s+/g;
const LEADING_WHITESPACE_RE = /\s/;
const WHITESPACE_BREAK_PENALTY = 512;
const MAX_INPUT_CHARS_SCHEMA = z.number().finite().int().positive();
const MAX_INPUT_CHARS_RESOLUTION_SCHEMA = z.object({
  providerMaxInputChars: MAX_INPUT_CHARS_SCHEMA.optional(),
  userMaxInputChars: MAX_INPUT_CHARS_SCHEMA.optional(),
});
const SPLIT_TEXT_OPTIONS_SCHEMA = z.object({
  maxChars: MAX_INPUT_CHARS_SCHEMA,
});

export interface MaxInputCharsResolution {
  readonly providerMaxInputChars?: number;
  readonly source?: "provider" | "user";
  readonly userExceedsProvider: boolean;
  readonly userMaxInputChars?: number;
  readonly value?: number;
}

export function resolveMaxInputChars(args: {
  providerMaxInputChars: number | undefined;
  userMaxInputChars: number | undefined;
}): MaxInputCharsResolution {
  const { providerMaxInputChars, userMaxInputChars } = parseWithMessage(
    MAX_INPUT_CHARS_RESOLUTION_SCHEMA,
    args,
    "maxInputChars must be a positive integer."
  );
  if (userMaxInputChars != null) {
    return {
      providerMaxInputChars,
      source: "user",
      userExceedsProvider:
        providerMaxInputChars != null &&
        userMaxInputChars > providerMaxInputChars,
      userMaxInputChars,
      value: userMaxInputChars,
    };
  }
  if (providerMaxInputChars != null) {
    return {
      providerMaxInputChars,
      source: "provider",
      userExceedsProvider: false,
      value: providerMaxInputChars,
    };
  }
  return { userExceedsProvider: false };
}

export function splitTextByMaxChars(text: string, maxChars: number): string[] {
  const { maxChars: resolvedMaxChars } = parseWithMessage(
    SPLIT_TEXT_OPTIONS_SCHEMA,
    { maxChars },
    "splitTextByMaxChars: maxChars must be a positive integer."
  );
  const trimmed = text.trim();
  if (trimmed.length <= resolvedMaxChars) {
    return trimmed.length > 0 ? [trimmed] : [];
  }

  const breakCandidates = collectBreakCandidates(trimmed);
  const chunks: string[] = [];
  const chunkCount = Math.ceil(trimmed.length / resolvedMaxChars);
  let start = 0;

  for (let chunkIndex = 1; chunkIndex < chunkCount; chunkIndex++) {
    const remainingChunks = chunkCount - chunkIndex;
    const remainingLength = trimmed.length - start;
    const idealEnd =
      start + Math.round(remainingLength / (remainingChunks + 1));
    const minEnd = Math.max(
      start + 1,
      trimmed.length - remainingChunks * resolvedMaxChars
    );
    const maxEnd = Math.min(
      start + resolvedMaxChars,
      trimmed.length - remainingChunks
    );
    const target = clamp(idealEnd, minEnd, maxEnd);
    const splitIndex =
      findSplitIndex({ breakCandidates, target, minEnd, maxEnd }) ??
      safeSplitIndex(trimmed, target, minEnd, maxEnd);
    const chunk = trimmed.slice(start, splitIndex).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    start = skipLeadingWhitespace(trimmed, splitIndex);
  }
  const finalChunk = trimmed.slice(start).trim();
  if (finalChunk.length > 0) {
    chunks.push(finalChunk);
  }
  return chunks;
}

function parseWithMessage<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message: string
): T {
  try {
    return schema.parse(value);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(message);
    }
    throw err;
  }
}

function safeSplitIndex(
  text: string,
  index: number,
  minEnd: number,
  maxEnd: number
): number {
  if (!isSurrogateBoundary(text, index)) {
    return index;
  }

  const candidates = [index + 1, index - 1];
  for (const candidate of candidates) {
    if (
      candidate >= minEnd &&
      candidate <= maxEnd &&
      !isSurrogateBoundary(text, candidate)
    ) {
      return candidate;
    }
  }

  return (
    candidates.find((candidate) => !isSurrogateBoundary(text, candidate)) ??
    index
  );
}

function isSurrogateBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return false;
  }
  const before = text.charCodeAt(index - 1);
  const after = text.charCodeAt(index);
  return (
    before >= 0xd8_00 &&
    before <= 0xdb_ff &&
    after >= 0xdc_00 &&
    after <= 0xdf_ff
  );
}

interface BreakCandidates {
  readonly line: readonly number[];
  readonly paragraph: readonly number[];
  readonly sentence: readonly number[];
  readonly whitespace: readonly number[];
}

function collectBreakCandidates(text: string): BreakCandidates {
  return {
    paragraph: collectLiteralBreaks(text, "\n\n"),
    line: collectLiteralBreaks(text, "\n"),
    sentence: collectRegexBreaks(text, SENTENCE_BOUNDARY_RE),
    whitespace: collectRegexBreaks(text, WHITESPACE_RE),
  };
}

function collectLiteralBreaks(text: string, literal: string): number[] {
  const breaks: number[] = [];
  let index = text.indexOf(literal);
  while (index !== -1) {
    breaks.push(index + literal.length);
    index = text.indexOf(literal, index + literal.length);
  }
  return breaks;
}

function collectRegexBreaks(text: string, regex: RegExp): number[] {
  const breaks: number[] = [];
  regex.lastIndex = 0;
  let match = regex.exec(text);
  while (match) {
    breaks.push(match.index + match[0].length);
    if (match[0].length === 0) {
      regex.lastIndex++;
    }
    match = regex.exec(text);
  }
  return breaks;
}

function findSplitIndex(args: {
  breakCandidates: BreakCandidates;
  target: number;
  minEnd: number;
  maxEnd: number;
}): number | undefined {
  let best: { index: number; score: number } | undefined;
  const candidateGroups = [
    { breaks: args.breakCandidates.paragraph, penalty: 0 },
    { breaks: args.breakCandidates.line, penalty: 16 },
    { breaks: args.breakCandidates.sentence, penalty: 32 },
    {
      breaks: args.breakCandidates.whitespace,
      penalty: WHITESPACE_BREAK_PENALTY,
    },
  ] as const;

  for (const group of candidateGroups) {
    for (const index of nearestCandidates(group.breaks, args.target)) {
      if (index < args.minEnd || index > args.maxEnd) {
        continue;
      }
      const score = Math.abs(index - args.target) + group.penalty;
      if (!best || score < best.score) {
        best = { index, score };
      }
    }
  }
  return best?.index;
}

function nearestCandidates(
  breaks: readonly number[],
  target: number
): number[] {
  const upper = lowerBound(breaks, target);
  const candidates: number[] = [];
  const lower = upper - 1;
  if (lower >= 0) {
    candidates.push(breaks[lower] ?? 0);
  }
  if (upper < breaks.length) {
    candidates.push(breaks[upper] ?? 0);
  }
  return candidates;
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if ((values[mid] ?? 0) < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function skipLeadingWhitespace(text: string, index: number): number {
  let next = index;
  while (next < text.length && LEADING_WHITESPACE_RE.test(text[next] ?? "")) {
    next++;
  }
  return next;
}
