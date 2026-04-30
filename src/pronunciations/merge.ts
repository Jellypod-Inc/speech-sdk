import type { Pronunciation } from "./types.js";

export function mergeRules(
  rules: readonly Pronunciation[]
): Map<string, Pronunciation> {
  const map = new Map<string, Pronunciation>();
  for (const rule of rules) {
    const caseSensitive = rule.caseSensitive ?? false;
    const key = caseSensitive ? rule.word : rule.word.toLowerCase();
    map.set(key, { ...rule, caseSensitive });
  }
  return map;
}
