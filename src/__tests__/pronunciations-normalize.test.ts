import { describe, expect, it } from "vitest";
import {
  normalizePronunciations,
  normalizeRule,
} from "../pronunciations/normalize.js";

describe("normalizeRule", () => {
  it("trims the ends of word and replacement but keeps internal whitespace", () => {
    expect(
      normalizeRule({ word: " New York ", replacement: "\tnoo YORK\n" })
    ).toEqual({ word: "New York", replacement: "noo YORK" });
  });

  it("preserves caseSensitive across normalization", () => {
    expect(
      normalizeRule({
        word: "LLM ",
        replacement: "el el em",
        caseSensitive: true,
      })
    ).toEqual({ word: "LLM", replacement: "el el em", caseSensitive: true });
  });
});

describe("normalizePronunciations", () => {
  it("passes through undefined and rule-less input", () => {
    expect(normalizePronunciations(undefined)).toEqual({
      pronunciations: undefined,
      warnings: [],
    });
    expect(normalizePronunciations({})).toEqual({
      pronunciations: {},
      warnings: [],
    });
  });

  it("warns instead of throwing, and treats whitespace-only identically to empty", () => {
    for (const rule of [
      { word: "", replacement: "x" },
      { word: " ", replacement: "x" },
      { word: "x", replacement: "" },
      { word: "x", replacement: "\t" },
    ]) {
      const { pronunciations, warnings } = normalizePronunciations({
        rules: [rule],
      });
      expect(warnings).toHaveLength(1);
      expect(pronunciations?.rules).toEqual([]);
    }
  });

  it("names the offending rule by index and word, and skips only that rule", () => {
    const { pronunciations, warnings } = normalizePronunciations({
      rules: [
        { word: "LLM", replacement: "el el em" },
        { word: "GPU", replacement: "  " },
        { word: "TPU", replacement: "tee pee you" },
      ],
    });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("pronunciations.rules[1]");
    expect(warnings[0]).toContain('"GPU"');
    expect(pronunciations?.rules?.map((r) => r.word)).toEqual(["LLM", "TPU"]);
  });

  it("keeps rules that are non-empty only after trimming", () => {
    const { pronunciations, warnings } = normalizePronunciations({
      rules: [{ word: "hello ", replacement: " HELLO" }],
    });
    expect(warnings).toEqual([]);
    expect(pronunciations?.rules).toEqual([
      { word: "hello", replacement: "HELLO" },
    ]);
  });
});
