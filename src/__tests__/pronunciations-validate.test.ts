import { describe, expect, it } from "vitest";
import { SpeechSDKError } from "../errors.js";
import { DictionaryIdsRequireGatewayError } from "../pronunciations/errors.js";
import { validatePronunciationsInput } from "../pronunciations/validate.js";

const RE_DICTIONARY_IDS = /dictionaryIds/i;
const RE_GATEWAY = /gateway/i;
const RE_WORD = /word/i;
const RE_REPLACEMENT = /replacement/i;
const RE_DICTIONARY = /dictionary/i;

describe("DictionaryIdsRequireGatewayError", () => {
  it("extends SpeechSDKError and has descriptive message", () => {
    const err = new DictionaryIdsRequireGatewayError();
    expect(err).toBeInstanceOf(SpeechSDKError);
    expect(err.name).toBe("DictionaryIdsRequireGatewayError");
    expect(err.message).toMatch(RE_DICTIONARY_IDS);
    expect(err.message).toMatch(RE_GATEWAY);
  });
});

describe("validatePronunciationsInput", () => {
  it("returns silently when input is undefined", () => {
    expect(() => validatePronunciationsInput(undefined, false)).not.toThrow();
  });

  it("accepts an empty pronunciations object (gateway server may still apply defaults)", () => {
    expect(() => validatePronunciationsInput({}, false)).not.toThrow();
    expect(() => validatePronunciationsInput({}, true)).not.toThrow();
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: [], rules: [] }, false)
    ).not.toThrow();
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: [], rules: [] }, true)
    ).not.toThrow();
  });

  it("throws DictionaryIdsRequireGatewayError when dictionaryIds is non-empty on direct path", () => {
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: ["x"] }, false)
    ).toThrowError(DictionaryIdsRequireGatewayError);
  });

  it("does not throw when dictionaryIds is non-empty on gateway path", () => {
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: ["x"] }, true)
    ).not.toThrow();
  });

  it("throws on empty word", () => {
    expect(() =>
      validatePronunciationsInput(
        { rules: [{ word: "", replacement: "x" }] },
        false
      )
    ).toThrowError(RE_WORD);
  });

  it("throws on empty replacement", () => {
    expect(() =>
      validatePronunciationsInput(
        { rules: [{ word: "x", replacement: "" }] },
        false
      )
    ).toThrowError(RE_REPLACEMENT);
  });

  it("throws on empty dictionary id string", () => {
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: [""] }, true)
    ).toThrowError(RE_DICTIONARY);
  });
});
