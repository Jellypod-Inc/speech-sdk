import { readsIpa } from "./ipa-models.js";
import type {
  MergedPronunciation,
  PronunciationForm,
  PronunciationInputRule,
  PronunciationTarget,
} from "./types.js";

// A case-sensitive rule for an already-lowercase word can collide with a case-insensitive rule for the same word in one merge call; Map.set's last-write-wins is fine here.
export function ruleMapKey(word: string, caseSensitive: boolean): string {
  return caseSensitive ? word : word.toLowerCase();
}

function chooseReplacement(
  rule: PronunciationInputRule,
  useIpa: boolean
): { form: PronunciationForm; replacement: string } {
  if (!("respelling" in rule)) {
    return { form: "respelling", replacement: rule.replacement.trim() };
  }
  const ipa = rule.ipa?.trim() ?? "";
  if (useIpa && ipa.length > 0) {
    return { form: "ipa", replacement: ipa };
  }
  return { form: "respelling", replacement: rule.respelling.trim() };
}

// Ends only — internal whitespace is significant, so "New York" -> "noo YORK" keeps matching.
function normalizeRule(
  rule: PronunciationInputRule,
  useIpa: boolean
): MergedPronunciation | undefined {
  const word = rule.word.trim();
  const { form, replacement } = chooseReplacement(rule, useIpa);
  if (word.length === 0 || replacement.length === 0) {
    return;
  }
  return {
    word,
    replacement,
    caseSensitive: rule.caseSensitive ?? false,
    form,
  };
}

/** Without a `target`, rules resolve to their respelling. */
export function mergeRules(
  rules: readonly PronunciationInputRule[],
  target?: PronunciationTarget
): Map<string, MergedPronunciation> {
  const useIpa = readsIpa(target);
  const map = new Map<string, MergedPronunciation>();
  for (const rule of rules) {
    const normalized = normalizeRule(rule, useIpa);
    if (normalized === undefined) {
      continue;
    }
    map.set(ruleMapKey(normalized.word, normalized.caseSensitive), normalized);
  }
  return map;
}
