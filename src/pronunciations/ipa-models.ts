import {
  GOOGLE_DEFAULT_MODEL,
  GOOGLE_IPA_PRONUNCIATION_MODELS,
  GOOGLE_PROVIDER_ID,
} from "../providers/google/models.js";
import type { PronunciationTarget } from "./types.js";

interface IpaSupport {
  readonly defaultModel: string;
  /** Turns a rule's plain `ipa` into the text the provider's models read as IPA. */
  readonly formatIpa: (ipa: string) => string;
  readonly models: ReadonlySet<string>;
}

// Gemini reads IPA only between slashes; a value the caller already wrapped is sent as is.
function wrapInSlashes(ipa: string): string {
  const isWrapped = ipa.length > 1 && ipa.startsWith("/") && ipa.endsWith("/");
  return isWrapped ? ipa : `/${ipa}/`;
}

// Mirrors each provider's FEATURES.IPA_PRONUNCIATION declarations without importing provider code, so the resolver stays browser-safe.
export const IPA_PRONUNCIATION_MODELS: Readonly<Record<string, IpaSupport>> = {
  [GOOGLE_PROVIDER_ID]: {
    defaultModel: GOOGLE_DEFAULT_MODEL,
    formatIpa: wrapInSlashes,
    models: GOOGLE_IPA_PRONUNCIATION_MODELS,
  },
};

function ipaSupportFor(providerId: string): IpaSupport | undefined {
  return Object.hasOwn(IPA_PRONUNCIATION_MODELS, providerId)
    ? IPA_PRONUNCIATION_MODELS[providerId]
    : undefined;
}

/** Whether this provider/model is sent a rule's IPA form; an omitted model means the provider's default. */
export function targetReadsIpa(target: PronunciationTarget): boolean {
  const support = ipaSupportFor(target.provider);
  if (!support) {
    return false;
  }
  return support.models.has(target.model ?? support.defaultModel);
}

export function ipaFormatterFor(
  providerId: string
): ((ipa: string) => string) | undefined {
  return ipaSupportFor(providerId)?.formatIpa;
}
