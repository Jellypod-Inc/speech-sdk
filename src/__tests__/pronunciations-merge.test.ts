import { describe, expect, it } from "vitest";
import { mergeRules, ruleMapKey } from "../pronunciations/merge.js";

describe("mergeRules", () => {
  it("returns an empty map for empty input", () => {
    expect(mergeRules([]).size).toBe(0);
  });

  it("keys case-insensitive rules by lowercased word", () => {
    const map = mergeRules([{ word: "LLM", replacement: "el el em" }]);
    expect(map.size).toBe(1);
    expect(map.get(ruleMapKey("LLM", false))).toEqual({
      word: "LLM",
      replacement: "el el em",
      caseSensitive: false,
    });
  });

  it("keys case-sensitive rules by exact word", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "el el em", caseSensitive: true },
    ]);
    expect(map.get(ruleMapKey("LLM", true))).toBeDefined();
    expect(map.get(ruleMapKey("LLM", false))).toBeUndefined();
  });

  it("last write wins on duplicate keys", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "first" },
      { word: "llm", replacement: "second" },
    ]);
    expect(map.size).toBe(1);
    expect(map.get(ruleMapKey("llm", false))?.replacement).toBe("second");
  });

  it("keys on the trimmed word, leaving internal whitespace intact", () => {
    const map = mergeRules([
      { word: "hello ", replacement: " HELLO" },
      { word: " New York ", replacement: "noo YORK" },
    ]);
    expect(map.get(ruleMapKey("hello", false))).toEqual({
      word: "hello",
      replacement: "HELLO",
      caseSensitive: false,
    });
    expect(map.get(ruleMapKey("new york", false))?.word).toBe("New York");
  });

  it("skips rules that are blank after trimming and keeps the rest", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "el el em" },
      { word: "  ", replacement: "x" },
      { word: "y", replacement: "" },
      { word: "GPU", replacement: "gee pee you" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get(ruleMapKey("llm", false))?.replacement).toBe("el el em");
    expect(map.get(ruleMapKey("gpu", false))?.replacement).toBe("gee pee you");
  });

  it("treats case-sensitive and case-insensitive variants of the same word as separate keys", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "case-sens", caseSensitive: true },
      { word: "LLM", replacement: "case-ins", caseSensitive: false },
    ]);
    expect(map.size).toBe(2);
    expect(map.get(ruleMapKey("LLM", true))?.replacement).toBe("case-sens");
    expect(map.get(ruleMapKey("LLM", false))?.replacement).toBe("case-ins");
  });
});
