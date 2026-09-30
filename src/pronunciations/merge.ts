import { modelReadsIpa, type ResolvedModel } from "../speech-provider.js";
import type {
  MergedPronunciation,
  PronunciationForm,
  PronunciationInputRule,
  PronunciationsInput,
} from "./types.js";

// A case-sensitive rule for an already-lowercase word can collide with a case-insensitive rule for the same word in one merge call; Map.set's last-write-wins is fine here.
export function ruleMapKey(word: string, caseSensitive: boolean): string {
  return caseSensitive ? word : word.toLowerCase();
}

function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// Checks values, not keys: untyped callers can pass `respelling: null` alongside a legacy `replacement`.
function chooseReplacement(
  rule: PronunciationInputRule,
  useIpa: boolean
): { form: PronunciationForm; replacement: string } {
  const ipa = "ipa" in rule ? trimmedString(rule.ipa) : "";
  if (useIpa && ipa.length > 0) {
    return { form: "ipa", replacement: ipa };
  }
  const respelling = "respelling" in rule ? rule.respelling : undefined;
  const replacement = "replacement" in rule ? rule.replacement : undefined;
  return {
    form: "respelling",
    replacement: trimmedString(
      typeof respelling === "string" ? respelling : replacement
    ),
  };
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

/** Rules resolve to `ipa` only when `useIpa` is set and the rule has one; otherwise to their respelling. */
export function mergeRules(
  rules: readonly PronunciationInputRule[],
  { useIpa = false }: { useIpa?: boolean } = {}
): Map<string, MergedPronunciation> {
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

export function mergeRulesForModel(
  pronunciations: PronunciationsInput | undefined,
  resolved: ResolvedModel
): Map<string, MergedPronunciation> | null {
  if (!pronunciations?.rules?.length) {
    return null;
  }
  return mergeRules(pronunciations.rules, {
    useIpa: modelReadsIpa(resolved),
  });
}
