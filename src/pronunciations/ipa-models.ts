import {
  GOOGLE_DEFAULT_MODEL,
  GOOGLE_IPA_PRONUNCIATION_MODELS,
  GOOGLE_PROVIDER_ID,
} from "../providers/google/models.js";
import type { PronunciationTarget } from "./types.js";

interface IpaSupport {
  readonly defaultModel: string;
  readonly models: ReadonlySet<string>;
}

const IPA_SUPPORT: Readonly<Record<string, IpaSupport>> = {
  [GOOGLE_PROVIDER_ID]: {
    defaultModel: GOOGLE_DEFAULT_MODEL,
    models: GOOGLE_IPA_PRONUNCIATION_MODELS,
  },
};

export function readsIpa(target: PronunciationTarget | undefined): boolean {
  if (target === undefined || !Object.hasOwn(IPA_SUPPORT, target.provider)) {
    return false;
  }
  const support = IPA_SUPPORT[target.provider];
  return support.models.has(target.model ?? support.defaultModel);
}
