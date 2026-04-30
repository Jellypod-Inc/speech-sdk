import { SpeechSDKError } from "../errors.js";
import { DictionaryIdsRequireGatewayError } from "./errors.js";
import type { PronunciationsInput } from "./types.js";

export function validatePronunciationsInput(
  input: PronunciationsInput | undefined,
  isGateway: boolean
): void {
  if (input === undefined) {
    return;
  }
  const dictIds = input.dictionaryIds ?? [];
  const rules = input.rules ?? [];

  if (dictIds.length === 0 && rules.length === 0) {
    throw new SpeechSDKError(
      "pronunciations: at least one of dictionaryIds or rules must be non-empty."
    );
  }

  if (dictIds.length > 0 && !isGateway) {
    throw new DictionaryIdsRequireGatewayError();
  }

  for (const id of dictIds) {
    if (typeof id !== "string" || id.length === 0) {
      throw new SpeechSDKError(
        "pronunciations.dictionaryIds: every id must be a non-empty string."
      );
    }
  }

  for (const rule of rules) {
    if (!rule.word || rule.word.length === 0) {
      throw new SpeechSDKError(
        "pronunciations.rules: every rule must have a non-empty `word`."
      );
    }
    if (!rule.replacement || rule.replacement.length === 0) {
      throw new SpeechSDKError(
        "pronunciations.rules: every rule must have a non-empty `replacement`."
      );
    }
  }
}
