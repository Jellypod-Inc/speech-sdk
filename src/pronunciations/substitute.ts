import type { Edit, Pronunciation } from "./types.js";

// `\W` treats non-ASCII letters as non-word, falsely reporting word boundaries inside "café" / "señor".
const WORD_CHAR_RE = /[\p{L}\p{N}_]/u;

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0 || index >= text.length) {
    return true;
  }
  return !(
    WORD_CHAR_RE.test(text[index]) && WORD_CHAR_RE.test(text[index - 1])
  );
}

function findMatch(
  text: string,
  i: number,
  sortedRules: readonly Pronunciation[]
): Pronunciation | undefined {
  for (const rule of sortedRules) {
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
      : slice.toLowerCase() === rule.word.toLowerCase();
    if (isMatch) {
      return rule;
    }
  }
  return;
}

function ruleKeyFor(rule: Pronunciation): string {
  return rule.caseSensitive ? rule.word : rule.word.toLowerCase();
}

export function substitute(
  text: string,
  ruleMap: Map<string, Pronunciation>
): { text: string; edits: Edit[] } {
  if (ruleMap.size === 0) {
    return { text, edits: [] };
  }

  const sortedRules = [...ruleMap.values()].sort(
    (a, b) => b.word.length - a.word.length
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

    const matched = findMatch(text, i, sortedRules);

    if (matched) {
      out.push(matched.replacement);
      edits.push({
        originalRange: [i, i + matched.word.length],
        replacementRange: [outLen, outLen + matched.replacement.length],
        originalWord: text.slice(i, i + matched.word.length),
        ruleKey: ruleKeyFor(matched),
      });
      outLen += matched.replacement.length;
      i += matched.word.length;
    } else {
      out.push(text[i]);
      outLen += 1;
      i += 1;
    }
  }

  return { text: out.join(""), edits };
}
