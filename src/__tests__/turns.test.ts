import { describe, expect, it } from "vitest";
import type { ConversationWordTimestamp } from "../timestamps.js";
import { timestampsToTurns } from "../turns.js";

describe("timestampsToTurns", () => {
  it("returns an empty array for empty input", () => {
    expect(timestampsToTurns([])).toEqual([]);
  });

  it("merges consecutive same-turn words into one entry", () => {
    const timestamps: ConversationWordTimestamp[] = [
      { text: "Hi", start: 0, end: 0.2, turnIndex: 0 },
      { text: "there.", start: 0.25, end: 0.6, turnIndex: 0 },
      { text: "Hello!", start: 1.0, end: 1.4, turnIndex: 1 },
    ];

    expect(timestampsToTurns(timestamps)).toEqual([
      { turnIndex: 0, start: 0, end: 0.6, text: "Hi there." },
      { turnIndex: 1, start: 1.0, end: 1.4, text: "Hello!" },
    ]);
  });

  it("emits one entry per word when every word is its own turn", () => {
    const timestamps: ConversationWordTimestamp[] = [
      { text: "A", start: 0, end: 0.1, turnIndex: 0 },
      { text: "B", start: 0.2, end: 0.3, turnIndex: 1 },
      { text: "C", start: 0.4, end: 0.5, turnIndex: 2 },
    ];

    const turns = timestampsToTurns(timestamps);
    expect(turns).toHaveLength(3);
    expect(turns.map((t) => t.text)).toEqual(["A", "B", "C"]);
  });

  it("returns a single entry when every word shares the same turn", () => {
    const timestamps: ConversationWordTimestamp[] = [
      { text: "one", start: 0, end: 0.1, turnIndex: 0 },
      { text: "two", start: 0.2, end: 0.3, turnIndex: 0 },
      { text: "three", start: 0.4, end: 0.6, turnIndex: 0 },
    ];

    expect(timestampsToTurns(timestamps)).toEqual([
      { turnIndex: 0, start: 0, end: 0.6, text: "one two three" },
    ]);
  });

  it("does not merge non-adjacent runs of the same turnIndex", () => {
    const timestamps: ConversationWordTimestamp[] = [
      { text: "a", start: 0, end: 0.1, turnIndex: 0 },
      { text: "b", start: 0.2, end: 0.3, turnIndex: 1 },
      { text: "c", start: 0.4, end: 0.5, turnIndex: 0 },
    ];

    const turns = timestampsToTurns(timestamps);
    expect(turns).toHaveLength(3);
    expect(turns.map((t) => t.turnIndex)).toEqual([0, 1, 0]);
  });
});
