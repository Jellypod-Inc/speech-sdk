import { describe, expect, it } from "vitest";
import { SpeechSDKError } from "../errors.js";
import { DictionaryIdsRequireGatewayError } from "../pronunciations/errors.js";
import { validatePronunciationsInput } from "../pronunciations/validate.js";

describe("DictionaryIdsRequireGatewayError", () => {
  it("extends SpeechSDKError and has descriptive message", () => {
    const err = new DictionaryIdsRequireGatewayError();
    expect(err).toBeInstanceOf(SpeechSDKError);
    expect(err.name).toBe("DictionaryIdsRequireGatewayError");
    expect(err.message).toMatch(/dictionaryIds/i);
    expect(err.message).toMatch(/gateway/i);
  });
});

describe("validatePronunciationsInput", () => {
  it("returns silently when input is undefined", () => {
    expect(() => validatePronunciationsInput(undefined, false)).not.toThrow();
  });

  it("throws when both dictionaryIds and rules are missing/empty", () => {
    expect(() => validatePronunciationsInput({}, false)).toThrowError(
      /at least one/i
    );
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: [], rules: [] }, false)
    ).toThrowError(/at least one/i);
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
    ).toThrowError(/word/i);
  });

  it("throws on empty replacement", () => {
    expect(() =>
      validatePronunciationsInput(
        { rules: [{ word: "x", replacement: "" }] },
        false
      )
    ).toThrowError(/replacement/i);
  });

  it("throws on empty dictionary id string", () => {
    expect(() =>
      validatePronunciationsInput({ dictionaryIds: [""] }, true)
    ).toThrowError(/dictionary/i);
  });
});
