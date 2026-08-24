import type { Pronunciation } from "./types.js";

// A case-sensitive rule for an already-lowercase word can collide with a case-insensitive rule for the same word in one merge call; Map.set's last-write-wins is fine here.
export function ruleMapKey(word: string, caseSensitive: boolean): string {
  return caseSensitive ? word : word.toLowerCase();
}

// Ends only — internal whitespace is significant, so "New York" -> "noo YORK" keeps matching.
function normalizeRule(rule: Pronunciation): Pronunciation | undefined {
  const word = rule.word.trim();
  const replacement = rule.replacement.trim();
  if (word.length === 0 || replacement.length === 0) {
    return;
  }
  return { ...rule, word, replacement };
}

export function mergeRules(
  rules: readonly Pronunciation[]
): Map<string, Pronunciation> {
  const map = new Map<string, Pronunciation>();
  for (const rule of rules) {
    const normalized = normalizeRule(rule);
    if (normalized === undefined) {
      continue;
    }
    const caseSensitive = normalized.caseSensitive ?? false;
    map.set(ruleMapKey(normalized.word, caseSensitive), {
      ...normalized,
      caseSensitive,
    });
  }
  return map;
}
