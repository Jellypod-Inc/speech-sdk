import { describe, expect, it } from "vitest";
import { mergeRules } from "../pronunciations/merge.js";
import { substitute } from "../pronunciations/substitute.js";

describe("substitute", () => {
  it("returns text unchanged and no edits when rules are empty", () => {
    const result = substitute("Hello, world.", new Map());
    expect(result.text).toBe("Hello, world.");
    expect(result.edits).toEqual([]);
  });

  it("substitutes a single occurrence at word boundaries", () => {
    const rules = mergeRules([{ word: "LLM", replacement: "el el em" }]);
    const result = substitute("What is LLM?", rules);
    expect(result.text).toBe("What is el el em?");
    expect(result.edits).toEqual([
      {
        originalRange: [8, 11],
        replacementRange: [8, 16],
        originalWord: "LLM",
        ruleKey: "llm",
      },
    ]);
  });

  it("does not match inside a larger word", () => {
    const rules = mergeRules([{ word: "el", replacement: "ZZ" }]);
    const result = substitute("hello belt", rules);
    expect(result.text).toBe("hello belt");
    expect(result.edits).toEqual([]);
  });

  it("does not match inside a non-ASCII word (Unicode-aware boundary)", () => {
    const rules = mergeRules([{ word: "caf", replacement: "X" }]);
    const result = substitute("café señor", rules);
    expect(result.text).toBe("café señor");
    expect(result.edits).toEqual([]);
  });

  it("substitutes multiple occurrences", () => {
    const rules = mergeRules([{ word: "LLM", replacement: "el el em" }]);
    const result = substitute("LLM and LLM.", rules);
    expect(result.text).toBe("el el em and el el em.");
    expect(result.edits).toHaveLength(2);
  });

  it("prefers longest replacement when rules overlap", () => {
    const rules = mergeRules([
      { word: "AI", replacement: "ay eye" },
      { word: "AGI", replacement: "ay gee eye" },
    ]);
    const result = substitute("AGI is the new AI", rules);
    expect(result.text).toBe("ay gee eye is the new ay eye");
    expect(result.edits).toHaveLength(2);
  });

  it("respects caseSensitive flag", () => {
    const rules = mergeRules([
      { word: "Apple", replacement: "AAP-pull", caseSensitive: true },
    ]);
    const result = substitute("Apple and apple", rules);
    expect(result.text).toBe("AAP-pull and apple");
    expect(result.edits).toHaveLength(1);
  });

  it("matches case-insensitively by default", () => {
    const rules = mergeRules([{ word: "LLM", replacement: "ell em" }]);
    const result = substitute("an llm and an LLM", rules);
    expect(result.text).toBe("an ell em and an ell em");
    expect(result.edits).toHaveLength(2);
  });

  it("populates ruleKey: lowercased word for case-insensitive rules, exact word for case-sensitive", () => {
    const rules = mergeRules([
      { word: "LLM", replacement: "el el em" }, // case-insensitive (default)
      { word: "Apple", replacement: "AAP-pull", caseSensitive: true },
    ]);
    const result = substitute("LLM and Apple", rules);
    expect(result.edits.map((e) => e.ruleKey)).toEqual(["llm", "Apple"]);
  });
});
