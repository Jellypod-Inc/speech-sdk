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

// Untyped callers can pass non-string fields, e.g. `respelling: null` beside a legacy `replacement`; those read as blank.
function toRule(input: PronunciationInputRule) {
  const respelling =
    "respelling" in input && typeof input.respelling === "string"
      ? input.respelling
      : "replacement" in input && input.replacement;
  return {
    word: trimmedString(input.word),
    respelling: trimmedString(respelling),
    ipa: "ipa" in input ? trimmedString(input.ipa) : "",
    caseSensitive: input.caseSensitive ?? false,
  };
}

// Ends only — internal whitespace is significant, so "New York" -> "noo YORK" keeps matching.
function normalizeRule(
  input: PronunciationInputRule,
  useIpa: boolean
): MergedPronunciation | undefined {
  const rule = toRule(input);
  const form: PronunciationForm =
    useIpa && rule.ipa.length > 0 ? "ipa" : "respelling";
  const replacement = form === "ipa" ? rule.ipa : rule.respelling;
  if (rule.word.length === 0 || replacement.length === 0) {
    return;
  }
  return {
    word: rule.word,
    replacement,
    caseSensitive: rule.caseSensitive,
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
