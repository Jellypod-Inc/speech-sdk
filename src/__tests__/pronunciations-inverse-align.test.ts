import { describe, expect, it } from "vitest";
import { inverseAlign } from "../pronunciations/inverse-align.js";
import type { Edit } from "../pronunciations/types.js";
import type { WordTimestamp } from "../timestamps.js";

describe("inverseAlign", () => {
  it("returns timestamps unchanged when there are no edits", () => {
    const ts: WordTimestamp[] = [
      { text: "hello", start: 0, end: 0.5 },
      { text: "world", start: 0.5, end: 1.0 },
    ];
    expect(inverseAlign(ts, "hello world", [])).toEqual(ts);
  });

  it("collapses consecutive substituted-word timestamps back to the original word", () => {
    const substituted = "What is el el em?";
    const edits: Edit[] = [
      {
        originalRange: [8, 11],
        replacementRange: [8, 16],
        originalWord: "LLM",
        ruleKey: "llm",
      },
    ];
    const ts: WordTimestamp[] = [
      { text: "What", start: 0.0, end: 0.2 },
      { text: "is", start: 0.2, end: 0.3 },
      { text: "el", start: 0.3, end: 0.5 },
      { text: "el", start: 0.5, end: 0.7 },
      { text: "em", start: 0.7, end: 0.9 },
    ];
    const result = inverseAlign(ts, substituted, edits);
    expect(result).toEqual([
      { text: "What", start: 0.0, end: 0.2 },
      { text: "is", start: 0.2, end: 0.3 },
      { text: "LLM", start: 0.3, end: 0.9 },
    ]);
  });

  it("handles multiple substitutions in one stream", () => {
    const substituted = "el el em and el el em";
    const edits: Edit[] = [
      {
        originalRange: [0, 3],
        replacementRange: [0, 8],
        originalWord: "LLM",
        ruleKey: "llm",
      },
      {
        originalRange: [8, 11],
        replacementRange: [13, 21],
        originalWord: "LLM",
        ruleKey: "llm",
      },
    ];
    const ts: WordTimestamp[] = [
      { text: "el", start: 0.0, end: 0.1 },
      { text: "el", start: 0.1, end: 0.2 },
      { text: "em", start: 0.2, end: 0.3 },
      { text: "and", start: 0.3, end: 0.5 },
      { text: "el", start: 0.5, end: 0.6 },
      { text: "el", start: 0.6, end: 0.7 },
      { text: "em", start: 0.7, end: 0.8 },
    ];
    const result = inverseAlign(ts, substituted, edits);
    expect(result.map((t) => t.text)).toEqual(["LLM", "and", "LLM"]);
    expect(result[0]).toMatchObject({ start: 0.0, end: 0.3 });
    expect(result[2]).toMatchObject({ start: 0.5, end: 0.8 });
  });

  it("passes through tokens not found in substituted text without advancing cursor", () => {
    const substituted = "el el em hi";
    const edits: Edit[] = [
      {
        originalRange: [0, 3],
        replacementRange: [0, 8],
        originalWord: "LLM",
        ruleKey: "llm",
      },
    ];
    const ts: WordTimestamp[] = [
      { text: "el", start: 0.0, end: 0.1 },
      { text: "el", start: 0.1, end: 0.2 },
      { text: "em", start: 0.2, end: 0.3 },
      { text: ",", start: 0.3, end: 0.31 },
      { text: "hi", start: 0.31, end: 0.5 },
    ];
    const result = inverseAlign(ts, substituted, edits);
    expect(result.map((t) => t.text)).toEqual(["LLM", ",", "hi"]);
    expect(result[0]).toMatchObject({ start: 0.0, end: 0.3 });
    expect(result[1]).toMatchObject({ text: ",", start: 0.3, end: 0.31 });
    expect(result[2]).toMatchObject({ text: "hi", start: 0.31, end: 0.5 });
  });

  it("preserves additional fields on conversation timestamps (turnIndex)", () => {
    const substituted = "el el em";
    const edits: Edit[] = [
      {
        originalRange: [0, 3],
        replacementRange: [0, 8],
        originalWord: "LLM",
        ruleKey: "llm",
      },
    ];
    const ts = [
      { text: "el", start: 0.0, end: 0.1, turnIndex: 2 },
      { text: "el", start: 0.1, end: 0.2, turnIndex: 2 },
      { text: "em", start: 0.2, end: 0.3, turnIndex: 2 },
    ];
    const result = inverseAlign(ts, substituted, edits);
    expect(result).toEqual([
      { text: "LLM", start: 0.0, end: 0.3, turnIndex: 2 },
    ]);
  });
});
