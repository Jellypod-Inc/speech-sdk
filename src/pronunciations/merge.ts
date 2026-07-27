import { normalizeRule } from "./normalize.js";
import type { Pronunciation } from "./types.js";

// A case-sensitive rule for an already-lowercase word can collide with a case-insensitive rule for the same word in one merge call; gateway dictionaries dedupe via a unique index, and Map.set's last-write-wins is fine for the inline-only case.
export function ruleMapKey(word: string, caseSensitive: boolean): string {
  return caseSensitive ? word : word.toLowerCase();
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
