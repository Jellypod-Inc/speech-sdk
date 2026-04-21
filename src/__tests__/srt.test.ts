import { describe, expect, it } from "vitest";
import {
  formatSrtTime,
  groupIntoSentences,
  normalizeTypography,
  splitSentenceIntoCues,
} from "../srt.js";
import type { WordTimestamp } from "../timestamps.js";

const w = (text: string, start: number, end: number): WordTimestamp => ({
  text,
  start,
  end,
});

describe("formatSrtTime", () => {
  it("formats zero as 00:00:00,000", () => {
    expect(formatSrtTime(0)).toBe("00:00:00,000");
  });

  it("formats sub-second with millisecond precision", () => {
    expect(formatSrtTime(0.123)).toBe("00:00:00,123");
  });

  it("rounds milliseconds, not truncates", () => {
    expect(formatSrtTime(0.9996)).toBe("00:00:01,000");
  });

  it("formats minutes and hours", () => {
    expect(formatSrtTime(3661.5)).toBe("01:01:01,500");
  });

  it("clamps negatives to 00:00:00,000", () => {
    expect(formatSrtTime(-1)).toBe("00:00:00,000");
  });
});

describe("normalizeTypography", () => {
  it("replaces curly single quotes with ASCII apostrophe", () => {
    expect(normalizeTypography("it\u2019s")).toBe("it's");
    expect(normalizeTypography("\u2018hi\u2019")).toBe("'hi'");
  });

  it("replaces curly double quotes with ASCII double quote", () => {
    expect(normalizeTypography("\u201Chello\u201D")).toBe('"hello"');
  });

  it("replaces en/em dashes with hyphen", () => {
    expect(normalizeTypography("a\u2013b\u2014c")).toBe("a-b-c");
  });

  it("replaces ellipsis with three dots", () => {
    expect(normalizeTypography("wait\u2026")).toBe("wait...");
  });

  it("collapses internal whitespace runs", () => {
    expect(normalizeTypography("a   b\t\tc")).toBe("a b c");
  });

  it("leaves plain ASCII unchanged", () => {
    expect(normalizeTypography("hello world")).toBe("hello world");
  });
});

describe("groupIntoSentences", () => {
  it("returns empty array for empty input", () => {
    expect(groupIntoSentences([])).toEqual([]);
  });

  it("returns one sentence for unpunctuated input", () => {
    const words = [w("hello", 0, 0.4), w("world", 0.4, 0.9)];
    expect(groupIntoSentences(words)).toEqual([words]);
  });

  it("splits on period", () => {
    const a = w("Hi.", 0, 0.3);
    const b = w("Bye", 0.4, 0.7);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("splits on question mark and exclamation", () => {
    const a = w("Yes?", 0, 0.3);
    const b = w("No!", 0.4, 0.7);
    const c = w("Maybe", 0.8, 1.1);
    expect(groupIntoSentences([a, b, c])).toEqual([[a], [b], [c]]);
  });

  it("treats trailing closing quote as part of terminator", () => {
    const a = w('"Run."', 0, 0.4);
    const b = w("Then", 0.5, 0.8);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("handles final word without terminator as its own sentence", () => {
    const a = w("Hello.", 0, 0.4);
    const b = w("World", 0.5, 0.9);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });
});

describe("splitSentenceIntoCues", () => {
  const opts = {
    maxCharsPerCue: 20,
    maxCueDurationMs: 5000,
    longPhraseCommaBreakChars: 15,
  };

  it("returns the sentence unchanged if it fits", () => {
    const s = [w("short", 0, 0.5), w("one.", 0.5, 0.9)];
    expect(splitSentenceIntoCues(s, opts)).toEqual([s]);
  });

  it("splits when char budget is exceeded", () => {
    const s = [
      w("this", 0, 0.3),
      w("is", 0.3, 0.5),
      w("a", 0.5, 0.6),
      w("longer", 0.6, 1.0),
      w("sentence", 1.0, 1.5),
      w("here.", 1.5, 2.0),
    ];
    const cues = splitSentenceIntoCues(s, opts);
    expect(cues.length).toBeGreaterThan(1);
    // Every word is preserved in order.
    expect(cues.flat()).toEqual(s);
  });

  it("breaks on comma when cue exceeds longPhraseCommaBreakChars", () => {
    const s = [
      w("one", 0, 0.3),
      w("two", 0.3, 0.6),
      w("three,", 0.6, 1.0),
      w("four", 1.0, 1.3),
      w("five.", 1.3, 1.7),
    ];
    const cues = splitSentenceIntoCues(s, opts);
    expect(cues[0]).toEqual([s[0], s[1], s[2]]);
    expect(cues[1]).toEqual([s[3], s[4]]);
  });

  it("splits when duration exceeds max", () => {
    const s = [w("slow", 0, 3), w("talker.", 3, 6)];
    const cues = splitSentenceIntoCues(s, { ...opts, maxCharsPerCue: 100 });
    expect(cues).toEqual([[s[0]], [s[1]]]);
  });
});
