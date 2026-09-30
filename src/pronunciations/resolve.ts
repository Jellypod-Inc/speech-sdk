import { mergeRules } from "./merge.js";
import { substitute } from "./substitute.js";
import type {
  PronunciationInputRule,
  PronunciationTarget,
  ResolvedPronunciation,
} from "./types.js";

/**
 * Returns each rule synthesis applies to `text` for `target`, once, sorted by `ruleKey`, with the exact replacement
 * it substitutes. Pure: uses the same merge and longest-first matching as synthesis.
 */
export function resolvePronunciations(
  text: string,
  rules: readonly PronunciationInputRule[],
  target: PronunciationTarget
): ResolvedPronunciation[] {
  const ruleMap = mergeRules(rules, target);
  const { edits } = substitute(text, ruleMap);
  const appliedKeys = [...new Set(edits.map((edit) => edit.ruleKey))].sort(
    (a, b) => {
      if (a === b) {
        return 0;
      }
      return a < b ? -1 : 1;
    }
  );

  const resolved: ResolvedPronunciation[] = [];
  for (const ruleKey of appliedKeys) {
    const rule = ruleMap.get(ruleKey);
    if (rule) {
      resolved.push({
        ruleKey,
        word: rule.word,
        caseSensitive: rule.caseSensitive,
        replacement: rule.replacement,
        form: rule.form,
      });
    }
  }
  return resolved;
}
