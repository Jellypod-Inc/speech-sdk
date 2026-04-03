import { resolveLocale } from "./locale-format.js";
import { expandNumbers } from "./number-expansion.js";
import type { SpeechOptions } from "./types.js";

export function preprocessText(text: string, options?: SpeechOptions): string {
  const symbolExpansion = options?.symbolExpansion !== false;

  if (!symbolExpansion) {
    return text;
  }

  if (!text) {
    return text;
  }

  try {
    const locale = resolveLocale(
      text,
      options?.symbolExpansion === true ? options.locale : undefined
    );
    return expandNumbers(text, locale);
  } catch {
    return text;
  }
}
