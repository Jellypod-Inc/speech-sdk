import { describe, expect, it } from "vitest";
import {
  splitTextByMaxChars,
  splitTextByMaxCharsAtTokens,
  splitTextByMaxWords,
} from "../text-chunker.js";

describe("spoken-word chunking", () => {
  it("keeps sentence punctuation, whitespace, and vocal tags intact", () => {
    expect(
      splitTextByMaxWords(
        "Hello[laughs], world.  Next line [short pause] here.",
        2
      )
    ).toEqual(["Hello[laughs], world.", "Next line [short pause] here."]);
  });

  it("never splits a word or vocal tag at the hard character ceiling", () => {
    expect(
      splitTextByMaxCharsAtTokens("One [short pause] two. Three four.", 22)
    ).toEqual(["One [short pause] two.", "Three four."]);
  });

  it("rejects invalid word and character limits", () => {
    for (const limit of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => splitTextByMaxWords("Hello.", limit)).toThrow(
        "maxChunkWords must be a positive integer."
      );
      expect(() => splitTextByMaxCharsAtTokens("Hello.", limit)).toThrow(
        "maxChars must be a positive integer."
      );
    }
    expect(() => splitTextByMaxCharsAtTokens("unbreakable", 5)).toThrow(
      "A word or vocal tag exceeds maxInputChars=5."
    );
  });

  it("splits unspaced CJK text and respects Unicode sentence boundaries", () => {
    expect(splitTextByMaxWords("你好世界。再见世界。", 4)).toEqual([
      "你好世界。",
      "再见世界。",
    ]);
    const text = "你好世界。".repeat(1200);
    const chunks = splitTextByMaxCharsAtTokens(text, 5000);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.length <= 5000)).toBe(true);
    expect(chunks.join("")).toBe(text);
  });
});

describe("splitTextByMaxChars", () => {
  it("splits on sentence boundaries before whitespace", () => {
    expect(splitTextByMaxChars("First sentence. Second sentence.", 16)).toEqual(
      ["First sentence.", "Second sentence."]
    );
  });

  it("supports CJK sentence boundaries without spaces", () => {
    expect(splitTextByMaxChars("你好世界。再见世界。", 6)).toEqual([
      "你好世界。",
      "再见世界。",
    ]);
  });

  it("supports Devanagari sentence boundaries", () => {
    expect(splitTextByMaxChars("राम गया।सीता आई।", 8)).toEqual([
      "राम गया।",
      "सीता आई।",
    ]);
  });

  it("hard-splits text with no natural break", () => {
    expect(splitTextByMaxChars("abcdefghij", 4)).toEqual([
      "abc",
      "defg",
      "hij",
    ]);
  });

  it("does not hard-split inside surrogate pairs", () => {
    expect(splitTextByMaxChars("😀a", 1)).toEqual(["😀", "a"]);
  });

  it("rejects non-finite and non-integer max character values", () => {
    expect(() => splitTextByMaxChars("hello", Number.NaN)).toThrow(
      "splitTextByMaxChars: maxChars must be a positive integer."
    );
    expect(() => splitTextByMaxChars("hello", 2.5)).toThrow(
      "splitTextByMaxChars: maxChars must be a positive integer."
    );
  });

  it("balances small overflow instead of filling the first chunk", () => {
    expect(
      splitTextByMaxChars("a".repeat(21), 20).map((c) => c.length)
    ).toEqual([11, 10]);
  });

  it("keeps very large inputs balanced across repeated chunks", () => {
    const chunks = splitTextByMaxChars("a".repeat(20_001), 5000);

    expect(chunks).toHaveLength(5);
    expect(chunks.every((chunk) => chunk.length <= 5000)).toBe(true);
    expect(chunks.map((chunk) => chunk.length)).toEqual([
      4000, 4000, 4000, 4001, 4000,
    ]);
  });
});
