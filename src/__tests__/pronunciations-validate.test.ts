import { describe, expect, it } from "vitest";
import { validatePronunciationsInput } from "../pronunciations/validate.js";

const RE_WORD = /word/i;
const RE_REPLACEMENT = /replacement/i;

describe("validatePronunciationsInput", () => {
  it("returns silently when input is undefined", () => {
    expect(() => validatePronunciationsInput(undefined)).not.toThrow();
  });

  it("accepts an empty pronunciations object (gateway server may still apply defaults)", () => {
    expect(() => validatePronunciationsInput({})).not.toThrow();
    expect(() => validatePronunciationsInput({ rules: [] })).not.toThrow();
  });

  it("throws on empty word", () => {
    expect(() =>
      validatePronunciationsInput({ rules: [{ word: "", replacement: "x" }] })
    ).toThrowError(RE_WORD);
  });

  it("throws on empty replacement", () => {
    expect(() =>
      validatePronunciationsInput({ rules: [{ word: "x", replacement: "" }] })
    ).toThrowError(RE_REPLACEMENT);
  });
});
