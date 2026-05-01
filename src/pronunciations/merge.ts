import type { Pronunciation } from "./types.js";

// Without a `cs:` / `ci:` prefix, a case-sensitive rule for a lowercase word collides with the case-insensitive rule for that same word.
export function ruleMapKey(word: string, caseSensitive: boolean): string {
  return caseSensitive ? `cs:${word}` : `ci:${word.toLowerCase()}`;
}

export function mergeRules(
  rules: readonly Pronunciation[]
): Map<string, Pronunciation> {
  const map = new Map<string, Pronunciation>();
  for (const rule of rules) {
    const caseSensitive = rule.caseSensitive ?? false;
    map.set(ruleMapKey(rule.word, caseSensitive), { ...rule, caseSensitive });
  }
  return map;
}
