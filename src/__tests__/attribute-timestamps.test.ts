import { describe, expect, it } from "vitest";
import { attributeTimestamps } from "../conversation/attribute-timestamps.js";

describe("attributeTimestamps", () => {
  it("assigns each word to the turn whose canonical text contains it", () => {
    const result = attributeTimestamps({
      timestamps: [
        { text: "Hi,", start: 0, end: 0.2 },
        { text: "there!", start: 0.2, end: 0.4 },
        { text: "Oh", start: 0.6, end: 0.7 },
        { text: "hey.", start: 0.7, end: 0.9 },
      ],
      turnTexts: ["Hi, there!", "Oh — hey."],
    });
    expect(result?.map((w) => w.turnIndex)).toEqual([0, 0, 1, 1]);
  });

  it("refuses words out of order with the turn text", () => {
    const result = attributeTimestamps({
      timestamps: [
        { text: "there", start: 0, end: 0.2 },
        { text: "hi", start: 0.2, end: 0.4 },
      ],
      turnTexts: ["hi", "there"],
    });
    expect(result).toBeUndefined();
  });

  it("refuses a word that straddles a turn boundary", () => {
    const result = attributeTimestamps({
      timestamps: [{ text: "hiyo", start: 0, end: 0.4 }],
      turnTexts: ["hi", "yo"],
    });
    expect(result).toBeUndefined();
  });

  it("refuses words that don't cover the whole text", () => {
    const result = attributeTimestamps({
      timestamps: [{ text: "hi", start: 0, end: 0.2 }],
      turnTexts: ["hi", "yo"],
    });
    expect(result).toBeUndefined();
  });
});
