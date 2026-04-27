import type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "../timestamps.js";

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
