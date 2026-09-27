import type { ConversationAttribution } from "../speech-result.js";
import { canonicalizeTimestampText } from "../timestamp-finalization.js";
import type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "../timestamps.js";
import { distributeWordsAcrossTurns } from "./proportional-fill.js";
import type { SilenceGap } from "./silence-detection.js";

const NORMALIZE_LEAD_RE = /^[^\p{L}\p{N}'-]+/u;
const NORMALIZE_TRAIL_RE = /[^\p{L}\p{N}'-]+$/u;
const WHITESPACE_SPLIT_RE = /\s+/;

function normalizeWord(s: string): string {
  return s
    .toLowerCase()
    .replace(NORMALIZE_LEAD_RE, "")
    .replace(NORMALIZE_TRAIL_RE, "");
}

function tokenizeTurn(text: string): string[] {
  return text
    .split(WHITESPACE_SPLIT_RE)
    .map(normalizeWord)
    .filter((t) => t.length > 0);
}

function levenshteinAtMost1(a: string, b: string): boolean {
  if (a === b) {
    return true;
  }
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) {
    return false;
  }
  // One substitution.
  if (la === lb) {
    let diffs = 0;
    for (let i = 0; i < la; i++) {
      if (a[i] !== b[i]) {
        diffs++;
        if (diffs > 1) {
          return false;
        }
      }
    }
    return true;
  }
  // One insertion or deletion.
  const [shorter, longer] = la < lb ? [a, b] : [b, a];
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i++;
      j++;
    } else if (skipped) {
      return false;
    } else {
      skipped = true;
      j++;
    }
  }
  return true;
}

export interface Tier2Result {
  readonly budgetExceeded: boolean;
  readonly mismatches: number;
  readonly timestamps: readonly ConversationWordTimestamp[];
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: tiered text-match is a single state machine — splitting hurts readability more than the score helps
export function tier2TextMatch(args: {
  timestamps: readonly WordTimestamp[];
  turnTexts: readonly string[];
}): Tier2Result {
  const { timestamps, turnTexts } = args;
  if (turnTexts.length === 0) {
    return {
      timestamps: [],
      mismatches: 0,
      budgetExceeded: timestamps.some((t) => normalizeWord(t.text).length > 0),
    };
  }
  const turnTokens = turnTexts.map((t) => tokenizeTurn(t));
  const totalExpected = turnTokens.reduce((n, t) => n + t.length, 0);

  // Per-turn budget: max(2, floor(0.2 * tokens_in_turn)).
  const perTurnBudget = turnTokens.map((t) =>
    Math.max(2, Math.floor(0.2 * t.length))
  );
  const perTurnUsed = turnTokens.map(() => 0);

  const out: ConversationWordTimestamp[] = [];
  let turnIndex = 0;
  let tokenIndex = 0;
  let totalMismatches = 0;
  let budgetExceeded = false;

  const recordDrift = () => {
    totalMismatches++;
    perTurnUsed[turnIndex] = (perTurnUsed[turnIndex] ?? 0) + 1;
    if ((perTurnUsed[turnIndex] ?? 0) > (perTurnBudget[turnIndex] ?? 0)) {
      budgetExceeded = true;
    }
  };

  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const observed = normalizeWord(ts.text);

    if (observed.length === 0) {
      // Skip pure-punctuation tokens entirely.
      continue;
    }

    // Advance turn boundary if current turn is exhausted.
    while (
      turnIndex < turnTokens.length &&
      tokenIndex >= (turnTokens[turnIndex]?.length ?? 0)
    ) {
      turnIndex++;
      tokenIndex = 0;
    }

    if (turnIndex >= turnTokens.length) {
      // Over-emit: provider returned more words than expected.
      budgetExceeded = true;
      out.push({
        text: ts.text,
        start: ts.start,
        end: ts.end,
        turnIndex: turnTokens.length - 1,
      });
      continue;
    }

    const expected = turnTokens[turnIndex]?.[tokenIndex] ?? "";

    if (observed === expected || levenshteinAtMost1(observed, expected)) {
      out.push({
        text: ts.text,
        start: ts.start,
        end: ts.end,
        turnIndex,
      });
      tokenIndex++;
      continue;
    }

    // Look-ahead 1: is observed actually the NEXT expected? (provider dropped a word)
    const expectedNext = turnTokens[turnIndex]?.[tokenIndex + 1];
    if (
      expectedNext &&
      (observed === expectedNext || levenshteinAtMost1(observed, expectedNext))
    ) {
      // Skip the dropped expected word. This is recovered drift, but still drift.
      recordDrift();
      tokenIndex++;
      out.push({
        text: ts.text,
        start: ts.start,
        end: ts.end,
        turnIndex,
      });
      tokenIndex++;
      continue;
    }

    // Look-behind 1 on observed: is the NEXT observed actually the current expected? (provider inserted)
    const observedNext = timestamps[i + 1]
      ? normalizeWord(timestamps[i + 1].text)
      : undefined;
    if (
      observedNext &&
      (observedNext === expected || levenshteinAtMost1(observedNext, expected))
    ) {
      // Treat observed as inserted: emit at current turn, don't advance tokenIndex.
      recordDrift();
      out.push({
        text: ts.text,
        start: ts.start,
        end: ts.end,
        turnIndex,
      });
      continue;
    }

    // Genuine mismatch: count against per-turn budget.
    recordDrift();
    out.push({
      text: ts.text,
      start: ts.start,
      end: ts.end,
      turnIndex,
    });
    tokenIndex++;
  }

  // End-of-stream consumption check at 95%.
  const consumedExpected =
    turnTokens.slice(0, turnIndex).reduce((n, t) => n + t.length, 0) +
    tokenIndex;
  if (
    totalExpected > 0 &&
    consumedExpected < Math.floor(totalExpected * 0.95)
  ) {
    budgetExceeded = true;
  }

  return {
    timestamps: out,
    mismatches: totalMismatches,
    budgetExceeded,
  };
}

const FALLBACK_TEXT_MATCH_WARNING =
  "speech-sdk: timestamp attribution fell back to text-matching (silence boundaries unclear)";
const FALLBACK_PROPORTIONAL_WARNING =
  "speech-sdk: timestamp attribution fell back to proportional distribution; treat per-word turnIndex as approximate.";
const TIMESTAMPS_UNAVAILABLE_WARNING =
  "speech-sdk: timestamp attribution unavailable; provider/STT returned no word timestamps.";
const MIN_TIER1_TOKEN_RATIO = 0.35;
const MAX_TIER1_TOKEN_RATIO = 2.5;

// Exact attribution: every word's canonical text must sit inside exactly one turn's canonical text, in order.
export function exactTextPartition(args: {
  timestamps: readonly WordTimestamp[];
  turnTexts: readonly string[];
}): readonly ConversationWordTimestamp[] | undefined {
  const turnChars = args.turnTexts.map((t) => [
    ...canonicalizeTimestampText(t),
  ]);
  const joined = turnChars.flat();
  const turnEnds: number[] = [];
  let end = 0;
  for (const chars of turnChars) {
    end += chars.length;
    turnEnds.push(end);
  }

  const out: ConversationWordTimestamp[] = [];
  let position = 0;
  let turnIndex = 0;
  for (const word of args.timestamps) {
    const chars = [...canonicalizeTimestampText(word.text)];
    if (chars.length === 0) {
      return;
    }
    for (const [offset, char] of chars.entries()) {
      if (joined[position + offset] !== char) {
        return;
      }
    }
    while (turnIndex < turnEnds.length && position >= turnEnds[turnIndex]) {
      turnIndex++;
    }
    if (position + chars.length > (turnEnds[turnIndex] ?? 0)) {
      return;
    }
    out.push({ text: word.text, start: word.start, end: word.end, turnIndex });
    position += chars.length;
  }
  return position === joined.length ? out : undefined;
}

function turnBoundaryPoints(
  words: readonly ConversationWordTimestamp[],
  turnCount: number
): number[] | undefined {
  const firstStart: (number | undefined)[] = new Array(turnCount);
  const lastEnd: (number | undefined)[] = new Array(turnCount);
  for (const w of words) {
    firstStart[w.turnIndex] ??= w.start;
    lastEnd[w.turnIndex] = w.end;
  }
  const points: number[] = [];
  for (let b = 0; b < turnCount - 1; b++) {
    const left = lastEnd[b];
    const right = firstStart[b + 1];
    if (left == null || right == null) {
      return;
    }
    points.push((left + right) / 2);
  }
  return points;
}

function gapMidpointSec(gap: SilenceGap): number {
  return (gap.startMs + gap.endMs) / 2 / 1000;
}

// Snaps each text-matched turn boundary to its nearest silence gap, then re-partitions words by those gaps.
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: silence-anchored partition is a single algorithm — splitting hurts readability more than the score helps
export function tier1SilenceAnchored(args: {
  timestamps: readonly ConversationWordTimestamp[];
  gaps: readonly SilenceGap[];
  turnTexts: readonly string[];
}): readonly ConversationWordTimestamp[] | undefined {
  const { timestamps, gaps, turnTexts } = args;
  const turnCount = turnTexts.length;
  if (turnCount <= 1) {
    return timestamps.map((w) => ({ ...w, turnIndex: 0 }));
  }
  if (timestamps.length === 0) {
    return;
  }
  const textBoundaries = turnBoundaryPoints(timestamps, turnCount);
  if (!textBoundaries) {
    return;
  }

  const firstWordStartSec = timestamps[0]?.start ?? 0;
  const lastWordEndSec = timestamps.at(-1)?.end ?? 0;
  const candidateMidpoints = gaps
    .map(gapMidpointSec)
    .filter((m) => m > firstWordStartSec && m < lastWordEndSec)
    .sort((a, b) => a - b);

  const boundariesSec: number[] = [];
  for (const point of textBoundaries) {
    const previous = boundariesSec.at(-1) ?? Number.NEGATIVE_INFINITY;
    let nearest: number | undefined;
    for (const m of candidateMidpoints) {
      if (
        m > previous &&
        (nearest == null || Math.abs(m - point) < Math.abs(nearest - point))
      ) {
        nearest = m;
      }
    }
    if (nearest == null) {
      return;
    }
    boundariesSec.push(nearest);
  }

  // Partition words by which segment each word's midpoint falls into.
  const partitions: WordTimestamp[][] = Array.from(
    { length: turnCount },
    () => []
  );
  for (const w of timestamps) {
    const midpoint = (w.start + w.end) / 2;
    let turnIndex = 0;
    while (
      turnIndex < boundariesSec.length &&
      midpoint >= (boundariesSec[turnIndex] ?? Number.POSITIVE_INFINITY)
    ) {
      turnIndex++;
    }
    partitions[turnIndex]?.push(w);
  }

  // Validate: no partition empty.
  if (partitions.some((p) => p.length === 0)) {
    return;
  }
  const expectedCounts = turnTexts.map((t) => tokenizeTurn(t).length);
  for (let i = 0; i < partitions.length; i++) {
    const expected = expectedCounts[i] ?? 0;
    if (expected === 0) {
      return;
    }
    const ratio = (partitions[i]?.length ?? 0) / expected;
    if (ratio < MIN_TIER1_TOKEN_RATIO || ratio > MAX_TIER1_TOKEN_RATIO) {
      return;
    }
  }

  const out: ConversationWordTimestamp[] = [];
  for (let i = 0; i < partitions.length; i++) {
    for (const w of partitions[i] ?? []) {
      out.push({ text: w.text, start: w.start, end: w.end, turnIndex: i });
    }
  }
  return out;
}

function sameTurnIndices(
  a: readonly ConversationWordTimestamp[],
  b: readonly ConversationWordTimestamp[]
): boolean {
  return (
    a.length === b.length && a.every((w, i) => w.turnIndex === b[i]?.turnIndex)
  );
}

export interface AttributeTimestampsResult {
  readonly attribution?: ConversationAttribution;
  readonly timestamps?: readonly ConversationWordTimestamp[];
  readonly warnings: readonly string[];
}

export function attributeTimestamps(args: {
  timestamps: readonly WordTimestamp[];
  turnTexts: readonly string[];
  silenceGaps: readonly SilenceGap[];
}): AttributeTimestampsResult {
  const { timestamps, turnTexts, silenceGaps } = args;
  const observed = timestamps.filter((w) => normalizeWord(w.text).length > 0);
  if (observed.length === 0 || turnTexts.length === 0) {
    return {
      timestamps: undefined,
      warnings: [TIMESTAMPS_UNAVAILABLE_WARNING],
    };
  }

  const exact = exactTextPartition({ timestamps: observed, turnTexts });
  const fuzzy = exact
    ? undefined
    : tier2TextMatch({ timestamps: observed, turnTexts });
  const textMatched = exact ?? (fuzzy?.budgetExceeded ? undefined : fuzzy);

  if (textMatched) {
    const textTimestamps = exact ?? fuzzy?.timestamps ?? [];
    const anchored = tier1SilenceAnchored({
      timestamps: textTimestamps,
      gaps: silenceGaps,
      turnTexts,
    });
    // An exact text match is ground truth: silence may confirm it, never move a word across turns.
    if (anchored && !(exact && !sameTurnIndices(anchored, exact))) {
      return { attribution: "silence", timestamps: anchored, warnings: [] };
    }
    return {
      attribution: "text",
      timestamps: textTimestamps,
      warnings: [
        `${FALLBACK_TEXT_MATCH_WARNING}; ${fuzzy?.mismatches ?? 0} word(s) tolerated as mismatches.`,
      ],
    };
  }

  const expectedTokensPerTurn = turnTexts.map(
    (t) => t.split(WHITESPACE_SPLIT_RE).filter((s) => s.length > 0).length
  );
  const tier3 = distributeWordsAcrossTurns(observed, expectedTokensPerTurn);
  return {
    attribution: "proportional",
    timestamps: tier3,
    warnings: [FALLBACK_PROPORTIONAL_WARNING],
  };
}
