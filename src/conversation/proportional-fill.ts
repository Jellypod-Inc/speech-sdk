import type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "../timestamps.js";

export function distributeWordsAcrossTurns(
  words: readonly WordTimestamp[],
  expectedTokensPerTurn: readonly number[]
): readonly ConversationWordTimestamp[] {
  if (words.length === 0) {
    return [];
  }
  if (expectedTokensPerTurn.length <= 1) {
    return words.map((w) => ({ ...w, turnIndex: 0 }));
  }

  const totalExpected = expectedTokensPerTurn.reduce((n, t) => n + t, 0);
  if (totalExpected === 0) {
    return words.map((w) => ({ ...w, turnIndex: 0 }));
  }

  const idealCounts = expectedTokensPerTurn.map(
    (t) => (t / totalExpected) * words.length
  );
  const counts = idealCounts.map(Math.floor);
  let assigned = counts.reduce((n, c) => n + c, 0);
  const remainders = idealCounts
    .map((value, turnIndex) => ({
      turnIndex,
      remainder: value - Math.floor(value),
    }))
    .sort((a, b) => b.remainder - a.remainder || a.turnIndex - b.turnIndex);

  for (const r of remainders) {
    if (assigned >= words.length) {
      break;
    }
    counts[r.turnIndex] = (counts[r.turnIndex] ?? 0) + 1;
    assigned++;
  }

  const out: ConversationWordTimestamp[] = [];
  let wordIndex = 0;
  for (let turnIndex = 0; turnIndex < counts.length; turnIndex++) {
    const count = counts[turnIndex] ?? 0;
    for (let i = 0; i < count && wordIndex < words.length; i++) {
      out.push({ ...words[wordIndex], turnIndex });
      wordIndex++;
    }
  }
  while (wordIndex < words.length) {
    out.push({
      ...words[wordIndex],
      turnIndex: expectedTokensPerTurn.length - 1,
    });
    wordIndex++;
  }
  return out;
}

export function fillTurnTimestampsProportional(args: {
  turnIndex: number;
  tokenCount: number;
  startSec: number;
  endSec: number;
  texts: readonly string[];
}): readonly ConversationWordTimestamp[] {
  const { turnIndex, tokenCount, startSec, endSec, texts } = args;
  if (tokenCount === 0) {
    return [];
  }
  const span = Math.max(0, endSec - startSec);
  const per = span / tokenCount;
  const out: ConversationWordTimestamp[] = [];
  for (let i = 0; i < tokenCount; i++) {
    out.push({
      text: texts[i] ?? "",
      start: startSec + i * per,
      end: startSec + (i + 1) * per,
      turnIndex,
    });
  }
  return out;
}
