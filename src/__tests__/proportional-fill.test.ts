import { describe, expect, it } from "vitest";
import {
  distributeWordsAcrossTurns,
  fillTurnTimestampsProportional,
} from "../conversation/proportional-fill.js";

describe("distributeWordsAcrossTurns", () => {
  it("distributes a flat word stream proportionally to expected token counts", () => {
    const words = [
      { text: "a", start: 0, end: 0.1 },
      { text: "b", start: 0.1, end: 0.2 },
      { text: "c", start: 0.2, end: 0.3 },
      { text: "d", start: 0.3, end: 0.4 },
      { text: "e", start: 0.4, end: 0.5 },
      { text: "f", start: 0.5, end: 0.6 },
    ];
    const expectedTokensPerTurn = [2, 4]; // 1/3 turn 0, 2/3 turn 1
    const result = distributeWordsAcrossTurns(words, expectedTokensPerTurn);
    expect(result.length).toBe(6);
    expect(result.filter((w) => w.turnIndex === 0).length).toBe(2);
    expect(result.filter((w) => w.turnIndex === 1).length).toBe(4);
  });

  it("handles single-turn input by emitting all turnIndex 0", () => {
    const words = [
      { text: "a", start: 0, end: 0.1 },
      { text: "b", start: 0.1, end: 0.2 },
    ];
    const result = distributeWordsAcrossTurns(words, [2]);
    expect(result.every((w) => w.turnIndex === 0)).toBe(true);
  });

  it("handles empty words by returning empty array", () => {
    const result = distributeWordsAcrossTurns([], [2, 3]);
    expect(result).toEqual([]);
  });

  it("clamps trailing words to last turn when proportions don't divide evenly", () => {
    const words = Array.from({ length: 5 }, (_, i) => ({
      text: `w${i}`,
      start: i * 0.1,
      end: (i + 1) * 0.1,
    }));
    const result = distributeWordsAcrossTurns(words, [3, 3, 3]);
    expect(result.length).toBe(5);
    expect(result.map((w) => w.turnIndex)).toEqual([0, 0, 1, 1, 2]);
    expect(result.at(-1)?.turnIndex).toBe(2);
  });
});

describe("fillTurnTimestampsProportional", () => {
  it("synthesizes word timestamps for a single turn given expected text and time range", () => {
    const result = fillTurnTimestampsProportional({
      turnIndex: 1,
      tokenCount: 4,
      startSec: 1.0,
      endSec: 3.0,
      texts: ["hello", "this", "is", "synthetic"],
    });
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({
      text: "hello",
      start: 1.0,
      end: 1.5,
      turnIndex: 1,
    });
    expect(result[3].end).toBeCloseTo(3.0);
    expect(result.every((w) => w.turnIndex === 1)).toBe(true);
  });

  it("returns empty array when token count is 0", () => {
    const result = fillTurnTimestampsProportional({
      turnIndex: 0,
      tokenCount: 0,
      startSec: 0,
      endSec: 1,
      texts: [],
    });
    expect(result).toEqual([]);
  });
});
