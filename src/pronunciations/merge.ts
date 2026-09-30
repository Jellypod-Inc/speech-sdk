import { modelReadsIpa, type ResolvedModel } from "../speech-provider.js";
import { ipaFormatterFor } from "./ipa-models.js";
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

// Untyped callers can pass non-object entries or non-string fields, e.g. `respelling: null` beside a legacy `replacement`; those read as blank.
function toRule(input: PronunciationInputRule | null | undefined) {
  if (typeof input !== "object" || input === null) {
    return { word: "", respelling: "", ipa: "", caseSensitive: false };
  }
  const respelling =
    "respelling" in input ? trimmedString(input.respelling) : "";
  return {
    word: trimmedString(input.word),
    respelling:
      respelling ||
      ("replacement" in input ? trimmedString(input.replacement) : ""),
    ipa: "ipa" in input ? trimmedString(input.ipa) : "",
    caseSensitive: input.caseSensitive ?? false,
  };
}

interface MergeOptions {
  /** Rewrites a chosen `ipa` into the form the model reads; see `IPA_PRONUNCIATION_MODELS`. */
  formatIpa?: (ipa: string) => string;
  useIpa?: boolean;
}

// Ends only — internal whitespace is significant, so "New York" -> "noo YORK" keeps matching.
function normalizeRule(
  input: PronunciationInputRule,
  { useIpa = false, formatIpa }: MergeOptions
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
    replacement:
      form === "ipa" && formatIpa ? formatIpa(replacement) : replacement,
    caseSensitive: rule.caseSensitive,
    form,
  };
}

/**
 * Rules resolve to `ipa` only when `useIpa` is set and the rule has one; otherwise to their respelling.
 * `formatIpa`, when given, rewrites a chosen `ipa` into the form the model reads.
 */
export function mergeRules(
  rules: readonly PronunciationInputRule[],
  options: MergeOptions = {}
): Map<string, MergedPronunciation> {
  const map = new Map<string, MergedPronunciation>();
  for (const rule of rules) {
    const normalized = normalizeRule(rule, options);
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
    formatIpa: ipaFormatterFor(resolved.provider.id),
  });
}
