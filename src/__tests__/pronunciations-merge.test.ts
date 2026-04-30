import { describe, expect, it } from "vitest";
import { mergeRules } from "../pronunciations/merge.js";

describe("mergeRules", () => {
  it("returns an empty map for empty input", () => {
    expect(mergeRules([]).size).toBe(0);
  });

  it("keys case-insensitive rules by lowercased word", () => {
    const map = mergeRules([{ word: "LLM", replacement: "el el em" }]);
    expect(map.size).toBe(1);
    expect(map.get("llm")).toEqual({
      word: "LLM",
      replacement: "el el em",
      caseSensitive: false,
    });
  });

  it("keys case-sensitive rules by exact word", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "el el em", caseSensitive: true },
    ]);
    expect(map.get("LLM")).toBeDefined();
    expect(map.get("llm")).toBeUndefined();
  });

  it("last write wins on duplicate keys", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "first" },
      { word: "llm", replacement: "second" },
    ]);
    expect(map.get("llm")?.replacement).toBe("second");
  });

  it("treats case-sensitive and case-insensitive variants of the same word as separate keys", () => {
    const map = mergeRules([
      { word: "LLM", replacement: "case-sens", caseSensitive: true },
      { word: "LLM", replacement: "case-ins", caseSensitive: false },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("LLM")?.replacement).toBe("case-sens");
    expect(map.get("llm")?.replacement).toBe("case-ins");
  });
});
