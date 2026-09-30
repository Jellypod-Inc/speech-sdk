import { textWithoutAudioTags } from "../audio-tags.js";
import { targetReadsIpa } from "./ipa-models.js";
import { mergeRules } from "./merge.js";
import { substitute } from "./substitute.js";
import type {
  PronunciationInputRule,
  PronunciationTarget,
  ResolvedPronunciation,
} from "./types.js";

/**
 * Returns each rule synthesis applies to `text` for `target`, once, sorted by `ruleKey`, with the exact replacement
 * it substitutes. Pure: uses the same audio-tag removal, merge and longest-first matching as synthesis.
 *
 * `target` is looked up among the SDK's built-in providers. A custom provider whose models declare
 * `FEATURES.IPA_PRONUNCIATION` is resolved as if it read respellings.
 */
export function resolvePronunciations(
  text: string,
  rules: readonly PronunciationInputRule[],
  target: PronunciationTarget
): ResolvedPronunciation[] {
  const ruleMap = mergeRules(rules, { useIpa: targetReadsIpa(target) });
  const { edits } = substitute(textWithoutAudioTags(text), ruleMap);
  const appliedKeys = [...new Set(edits.map((edit) => edit.ruleKey))].sort();
  return appliedKeys.flatMap((ruleKey) => {
    const rule = ruleMap.get(ruleKey);
    return rule ? [{ ruleKey, ...rule }] : [];
  });
}
