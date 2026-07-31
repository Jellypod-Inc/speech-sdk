import { describe, expect, it } from "vitest";
import {
  inverseAlign,
  inverseAlignWithQuality,
} from "../pronunciations/inverse-align.js";
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

  it("restores word boundaries when a multi-word phrase is replaced", () => {
    const substituted = "leed singer joined";
    const edits: Edit[] = [
      {
        originalRange: [0, 11],
        replacementRange: [0, 11],
        originalWord: "lead singer",
        ruleKey: "lead singer",
      },
    ];
    const providerTimestamps: WordTimestamp[] = [
      { text: "leed", start: 0, end: 0.2 },
      { text: "singer", start: 0.2, end: 0.6 },
      { text: "joined", start: 0.6, end: 0.9 },
    ];

    expect(inverseAlign(providerTimestamps, substituted, edits)).toEqual([
      { text: "lead", start: 0, end: 0.2 },
      { text: "singer", start: 0.2, end: 0.6 },
      { text: "joined", start: 0.6, end: 0.9 },
    ]);
  });

  it("interpolates source boundaries when a replacement has fewer aligned words", () => {
    const substituted = "leedsinger joined";
    const edits: Edit[] = [
      {
        originalRange: [0, 11],
        replacementRange: [0, 10],
        originalWord: "lead singer",
        ruleKey: "lead singer",
      },
    ];
    const providerTimestamps: WordTimestamp[] = [
      { text: "leedsinger", start: 0, end: 0.6 },
      { text: "joined", start: 0.6, end: 0.9 },
    ];

    const result = inverseAlignWithQuality(
      providerTimestamps,
      substituted,
      edits
    );

    expect(result.timestamps).toEqual([
      { text: "lead", start: 0, end: 0.3 },
      { text: "singer", start: 0.3, end: 0.6 },
      { text: "joined", start: 0.6, end: 0.9 },
    ]);
    expect(result.estimatedBoundaries).toBe(true);
  });

  it("preserves the exact prefix and merges the production replacement span", () => {
    const substituted = "Kris Van Haagt joined";
    const edits: Edit[] = [
      {
        originalRange: [0, 14],
        replacementRange: [0, 14],
        originalWord: "Kris Vanhaecht",
        ruleKey: "kris vanhaecht",
      },
    ];
    const providerTimestamps: WordTimestamp[] = [
      { text: "Kris", start: 0, end: 0.18 },
      { text: "Van", start: 0.18, end: 0.31 },
      { text: "Haagt", start: 0.31, end: 0.55 },
      { text: "joined", start: 0.55, end: 0.9 },
    ];

    const result = inverseAlignWithQuality(
      providerTimestamps,
      substituted,
      edits
    );

    expect(result.timestamps).toEqual([
      { text: "Kris", start: 0, end: 0.18 },
      { text: "Vanhaecht", start: 0.18, end: 0.55 },
      { text: "joined", start: 0.55, end: 0.9 },
    ]);
    expect(result.estimatedBoundaries).toBe(false);
  });

  it("projects every positive source and replacement token count", () => {
    for (let sourceCount = 1; sourceCount <= 6; sourceCount += 1) {
      for (
        let replacementCount = 1;
        replacementCount <= 6;
        replacementCount += 1
      ) {
        const sourceTokens = Array.from(
          { length: sourceCount },
          (_, index) => `source${index}`
        );
        const replacementTokens = Array.from(
          { length: replacementCount },
          (_, index) => `spoken${index}`
        );
        const substituted = replacementTokens.join(" ");
        const edits: Edit[] = [
          {
            originalRange: [0, sourceTokens.join(" ").length],
            replacementRange: [0, substituted.length],
            originalWord: sourceTokens.join(" "),
            ruleKey: "matrix",
          },
        ];
        const providerTimestamps = replacementTokens.map((text, index) => ({
          text,
          start: index,
          end: index + 1,
        }));

        const result = inverseAlignWithQuality(
          providerTimestamps,
          substituted,
          edits
        );

        expect(result.timestamps.map(({ text }) => text)).toEqual(sourceTokens);
        expect(result.timestamps).toHaveLength(sourceCount);
        expect(result.timestamps[0]?.start).toBe(0);
        expect(result.timestamps.at(-1)?.end).toBe(replacementCount);
        for (let index = 1; index < result.timestamps.length; index += 1) {
          expect(result.timestamps[index]?.start).toBeGreaterThanOrEqual(
            result.timestamps[index - 1]?.end ?? 0
          );
        }
        expect(result.estimatedBoundaries).toBe(
          sourceCount > 1 && sourceCount !== replacementCount
        );
      }
    }
  });

  it("leaves an anchored source deletion at a monotonic zero-duration boundary", () => {
    const substituted = "alpha omega";
    const edits: Edit[] = [
      {
        originalRange: [0, 19],
        replacementRange: [0, 11],
        originalWord: "alpha omitted omega",
        ruleKey: "deletion",
      },
    ];
    const timestamps: WordTimestamp[] = [
      { text: "alpha", start: 0, end: 0.2 },
      { text: "omega", start: 0.3, end: 0.5 },
    ];

    const result = inverseAlignWithQuality(timestamps, substituted, edits);

    expect(result.timestamps).toEqual([
      { text: "alpha", start: 0, end: 0.2 },
      { text: "omitted", start: 0.2, end: 0.2 },
      { text: "omega", start: 0.3, end: 0.5 },
    ]);
    expect(result.estimatedBoundaries).toBe(true);
  });

  it("attaches an inserted replacement token without discarding exact anchors", () => {
    const substituted = "alpha extra omega";
    const edits: Edit[] = [
      {
        originalRange: [0, 11],
        replacementRange: [0, 17],
        originalWord: "alpha omega",
        ruleKey: "insertion",
      },
    ];
    const timestamps: WordTimestamp[] = [
      { text: "alpha", start: 0, end: 0.2 },
      { text: "extra", start: 0.2, end: 0.35 },
      { text: "omega", start: 0.35, end: 0.6 },
    ];

    const result = inverseAlignWithQuality(timestamps, substituted, edits);

    expect(result.timestamps).toEqual([
      { text: "alpha", start: 0, end: 0.2 },
      { text: "omega", start: 0.2, end: 0.6 },
    ]);
    expect(result.estimatedBoundaries).toBe(false);
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
