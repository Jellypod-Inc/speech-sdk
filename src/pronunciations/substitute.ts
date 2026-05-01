import type { Edit, Pronunciation } from "./types.js";

const NON_WORD_RE = /\W/;

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return true;
  }
  return NON_WORD_RE.test(text[index]) || NON_WORD_RE.test(text[index - 1]);
}

type RuleEntry = readonly [key: string, rule: Pronunciation];

function findMatch(
  text: string,
  i: number,
  sortedEntries: readonly RuleEntry[]
): RuleEntry | undefined {
  for (const entry of sortedEntries) {
    const [key, rule] = entry;
    const len = rule.word.length;
    if (i + len > text.length) {
      continue;
    }
    if (!isWordBoundary(text, i + len)) {
      continue;
    }
    const slice = text.slice(i, i + len);
    const isMatch = rule.caseSensitive
      ? slice === rule.word
      : slice.toLowerCase() === key;
    if (isMatch) {
      return entry;
    }
  }
  return;
}

export function substitute(
  text: string,
  ruleMap: Map<string, Pronunciation>
): { text: string; edits: Edit[] } {
  if (ruleMap.size === 0) {
    return { text, edits: [] };
  }

  const sortedEntries = [...ruleMap.entries()].sort(
    ([, a], [, b]) => b.word.length - a.word.length
  );

  const out: string[] = [];
  const edits: Edit[] = [];
  let i = 0;
  let outLen = 0;

  while (i < text.length) {
    if (!isWordBoundary(text, i)) {
      out.push(text[i]);
      outLen += 1;
      i += 1;
      continue;
    }

    const matched = findMatch(text, i, sortedEntries);

    if (matched) {
      const [key, rule] = matched;
      out.push(rule.replacement);
      edits.push({
        originalRange: [i, i + rule.word.length],
        replacementRange: [outLen, outLen + rule.replacement.length],
        originalWord: text.slice(i, i + rule.word.length),
        ruleKey: key,
      });
      outLen += rule.replacement.length;
      i += rule.word.length;
    } else {
      out.push(text[i]);
      outLen += 1;
      i += 1;
    }
  }

  return { text: out.join(""), edits };
}
