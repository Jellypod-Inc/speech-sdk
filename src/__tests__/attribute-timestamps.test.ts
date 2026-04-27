import { describe, expect, it } from "vitest";
import { tier2TextMatch } from "../conversation/attribute-timestamps.js";

describe("tier2TextMatch", () => {
  it("attributes a clean match with no warnings", () => {
    const result = tier2TextMatch({
      timestamps: [
        { text: "hello", start: 0, end: 0.2 },
        { text: "world", start: 0.3, end: 0.5 },
        { text: "again", start: 0.6, end: 0.8 },
      ],
      turnTexts: ["hello world", "again"],
    });
    expect(result.timestamps.map((t) => t.turnIndex)).toEqual([0, 0, 1]);
    expect(result.mismatches).toBe(0);
  });

  it("tolerates fuzzy matches within 1-edit Levenshtein", () => {
    // 'thanks' vs 'thank' is a 1-edit (single deletion). 'OK' vs 'okay' is 2-edit
    // and not caught by 1-edit Levenshtein — those have to fall through to mismatch
    // budget instead.
    const result = tier2TextMatch({
      timestamps: [
        { text: "thanks", start: 0, end: 0.1 },
        { text: "color", start: 0.2, end: 0.4 },
      ],
      turnTexts: ["thank colour"],
    });
    expect(result.timestamps.map((t) => t.turnIndex)).toEqual([0, 0]);
    expect(result.mismatches).toBe(0);
  });

  it("uses look-ahead to recover when provider drops a word", () => {
    // Expected: "hello there friend"; observed dropped "there".
    const result = tier2TextMatch({
      timestamps: [
        { text: "hello", start: 0, end: 0.2 },
        { text: "friend", start: 0.4, end: 0.6 },
      ],
      turnTexts: ["hello there friend"],
    });
    expect(result.timestamps.map((t) => t.turnIndex)).toEqual([0, 0]);
    expect(result.mismatches).toBe(1);
  });

  it("uses look-ahead to recover when provider inserts a word", () => {
    // Expected: "hello friend"; observed inserted "umm".
    const result = tier2TextMatch({
      timestamps: [
        { text: "hello", start: 0, end: 0.2 },
        { text: "umm", start: 0.25, end: 0.3 },
        { text: "friend", start: 0.4, end: 0.6 },
      ],
      turnTexts: ["hello friend"],
    });
    expect(result.timestamps.map((t) => t.turnIndex)).toEqual([0, 0, 0]);
    expect(result.mismatches).toBe(1);
  });

  it("isolates mismatch budget per turn", () => {
    // Turn 0 has 3 mismatches (well above its budget); turn 1 should still match cleanly.
    // Tier 2 returns mismatches > budget signal; the dispatcher escalates to Tier 3.
    // For Tier 2 itself, we just assert it counts mismatches and reports per-turn budget exceedance.
    const result = tier2TextMatch({
      timestamps: [
        { text: "completely", start: 0, end: 0.2 },
        { text: "wrong", start: 0.2, end: 0.4 },
        { text: "garbage", start: 0.4, end: 0.6 },
        { text: "hello", start: 0.7, end: 0.9 },
      ],
      turnTexts: ["a b c", "hello"],
    });
    // Even with mismatches in turn 0, observable behavior should be: tier2 reports budgetExceeded true,
    // but the timestamps array is still complete (turnIndex assignments may be inaccurate).
    expect(result.timestamps.length).toBe(4);
    expect(result.budgetExceeded).toBe(true);
  });

  it("emits empty observed words skipped (not clamp-emitted)", () => {
    // Pure-punctuation tokens should be skipped entirely.
    const result = tier2TextMatch({
      timestamps: [
        { text: "hi", start: 0, end: 0.1 },
        { text: ".", start: 0.1, end: 0.12 },
        { text: "there", start: 0.2, end: 0.4 },
      ],
      turnTexts: ["hi there"],
    });
    expect(result.timestamps.length).toBe(2);
    expect(result.timestamps.map((t) => t.text)).toEqual(["hi", "there"]);
  });

  it("flags budgetExceeded when end-of-stream consumption is below 95%", () => {
    // Expected has 10 tokens; observed has 4 — short-circuit consumption.
    const turnText = "one two three four five six seven eight nine ten";
    const result = tier2TextMatch({
      timestamps: [
        { text: "one", start: 0, end: 0.1 },
        { text: "two", start: 0.1, end: 0.2 },
        { text: "three", start: 0.2, end: 0.3 },
        { text: "four", start: 0.3, end: 0.4 },
      ],
      turnTexts: [turnText],
    });
    expect(result.budgetExceeded).toBe(true);
  });

  it("returns empty timestamps with budgetExceeded when turnTexts is empty", () => {
    const result = tier2TextMatch({
      timestamps: [
        { text: "hello", start: 0, end: 0.1 },
        { text: "world", start: 0.1, end: 0.2 },
      ],
      turnTexts: [],
    });
    expect(result.timestamps).toEqual([]);
    expect(result.budgetExceeded).toBe(true);
    expect(result.mismatches).toBe(0);
  });
});
