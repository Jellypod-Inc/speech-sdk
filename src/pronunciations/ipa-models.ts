import {
  GOOGLE_DEFAULT_MODEL,
  GOOGLE_IPA_PRONUNCIATION_MODELS,
  GOOGLE_PROVIDER_ID,
} from "../providers/google/models.js";
import type { PronunciationTarget } from "./types.js";

// Mirrors each provider's FEATURES.IPA_PRONUNCIATION declarations without importing provider code, so the resolver stays browser-safe.
export const IPA_PRONUNCIATION_MODELS: Readonly<
  Record<string, { defaultModel: string; models: ReadonlySet<string> }>
> = {
  [GOOGLE_PROVIDER_ID]: {
    defaultModel: GOOGLE_DEFAULT_MODEL,
    models: GOOGLE_IPA_PRONUNCIATION_MODELS,
  },
};

export function targetReadsIpa(target: PronunciationTarget): boolean {
  if (!Object.hasOwn(IPA_PRONUNCIATION_MODELS, target.provider)) {
    return false;
  }
  const support = IPA_PRONUNCIATION_MODELS[target.provider];
  return support.models.has(target.model ?? support.defaultModel);
}
