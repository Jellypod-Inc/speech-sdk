import { textWithoutAudioTags } from "../audio-tags.js";
import { ipaFormatterFor, targetReadsIpa } from "./ipa-models.js";
import { mergeMatchableRules, mergeRules } from "./merge.js";
import { substitute } from "./substitute.js";
import type {
  Pronunciation,
  PronunciationInputRule,
  PronunciationTarget,
  ResolvedPronunciation,
} from "./types.js";

// The one matcher behind resolvePronunciations and matchPronunciations: synthesis's audio-tag removal and longest-first substitution.
function matchedRuleKeys(
  text: string,
  ruleMap: Map<string, Pronunciation>
): string[] {
  const { edits } = substitute(textWithoutAudioTags(text), ruleMap);
  return [...new Set(edits.map((edit) => edit.ruleKey))].sort();
}

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
  const ruleMap = mergeRules(rules, {
    useIpa: targetReadsIpa(target),
    formatIpa: ipaFormatterFor(target.provider),
  });
  return matchedRuleKeys(text, ruleMap).flatMap((ruleKey) => {
    const rule = ruleMap.get(ruleKey);
    return rule ? [{ ruleKey, ...rule }] : [];
  });
}

/**
 * Returns the `ruleMapKey` of every rule substitution would apply to `text`, once, sorted, for any target: the same
 * merge, word-boundary, case and longest-first matching as `resolvePronunciations`, never inside audio tags. A rule
 * counts when it has a `respelling` or an `ipa`, whichever form a model would receive.
 */
export function matchPronunciations(
  text: string,
  rules: readonly PronunciationInputRule[]
): string[] {
  return matchedRuleKeys(text, mergeMatchableRules(rules));
}
