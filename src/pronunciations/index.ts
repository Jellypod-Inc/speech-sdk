// biome-ignore-all lint/performance/noBarrelFile: public pronunciations subpath entry point
export { inverseAlign } from "./inverse-align.js";
export { targetReadsIpa } from "./ipa-models.js";
export { mergeRules, ruleMapKey } from "./merge.js";
export { matchPronunciations, resolvePronunciations } from "./resolve.js";
export { substitute } from "./substitute.js";
export type {
  Edit,
  Pronunciation,
  PronunciationRule,
  PronunciationsInput,
  PronunciationTarget,
  ResolvedPronunciation,
} from "./types.js";
