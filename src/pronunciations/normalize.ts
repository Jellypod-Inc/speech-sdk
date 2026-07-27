import { debug } from "../logger.js";
import type { Pronunciation, PronunciationsInput } from "./types.js";

// Ends only — internal whitespace is significant, so "New York" -> "noo YORK" keeps matching.
export function normalizeRule(rule: Pronunciation): Pronunciation | undefined {
  const word = rule.word.trim();
  const replacement = rule.replacement.trim();
  if (word.length === 0 || replacement.length === 0) {
    return;
  }
  return { ...rule, word, replacement };
}

export function normalizePronunciations(
  input: PronunciationsInput | undefined
): {
  pronunciations: PronunciationsInput | undefined;
  warnings: string[];
} {
  if (input?.rules === undefined) {
    return { pronunciations: input, warnings: [] };
  }

  const rules: Pronunciation[] = [];
  const warnings: string[] = [];

  for (const [index, rule] of input.rules.entries()) {
    const normalized = normalizeRule(rule);
    if (normalized) {
      rules.push(normalized);
      continue;
    }
    const warning = `pronunciations.rules[${index}] (word: ${JSON.stringify(rule.word)}): skipped — \`word\` and \`replacement\` must both be non-empty after trimming.`;
    warnings.push(warning);
    debug(warning);
  }

  return { pronunciations: { ...input, rules }, warnings };
}
