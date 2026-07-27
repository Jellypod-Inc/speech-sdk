import { describe, expect, it } from "vitest";
import { normalizePronunciations } from "../pronunciations/normalize.js";

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
});
