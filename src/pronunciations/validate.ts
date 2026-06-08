import { SpeechSDKError } from "../errors.js";
import type { PronunciationsInput } from "./types.js";

export function validatePronunciationsInput(
  input: PronunciationsInput | undefined
): void {
  if (input === undefined) {
    return;
  }
  const rules = input.rules ?? [];

  for (const rule of rules) {
    if (rule.word.length === 0) {
      throw new SpeechSDKError(
        "pronunciations.rules: every rule must have a non-empty `word`."
      );
    }
    if (rule.replacement.length === 0) {
      throw new SpeechSDKError(
        "pronunciations.rules: every rule must have a non-empty `replacement`."
      );
    }
  }
}
