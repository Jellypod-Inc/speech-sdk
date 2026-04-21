import { describe, expect, it } from "vitest";
import {
  escapeVttText,
  formatSrtTime,
  formatVttTime,
  groupIntoSentences,
  normalizeTypography,
  splitSentenceIntoCues,
  timestampsToCaptions,
  wrapCueText,
} from "../captions.js";
import type { WordTimestamp } from "../timestamps.js";

const w = (text: string, start: number, end: number): WordTimestamp => ({
  text,
  start,
  end,
});

const WHITESPACE = /\s+/;
const CURLY_QUOTES = /[\u2018\u2019\u201C\u201D]/;

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

describe("formatVttTime", () => {
  it("uses a period decimal separator", () => {
    expect(formatVttTime(0)).toBe("00:00:00.000");
    expect(formatVttTime(1.5)).toBe("00:00:01.500");
  });

  it("matches SRT format apart from the separator", () => {
    expect(formatVttTime(3661.5)).toBe("01:01:01.500");
  });

  it("clamps negatives to 00:00:00.000", () => {
    expect(formatVttTime(-1)).toBe("00:00:00.000");
  });
});

describe("escapeVttText", () => {
  it("escapes ampersand, lt, and gt", () => {
    expect(escapeVttText("a & b")).toBe("a &amp; b");
    expect(escapeVttText("<tag>")).toBe("&lt;tag&gt;");
  });

  it("escapes ampersand first to avoid double-escaping", () => {
    expect(escapeVttText("&lt;")).toBe("&amp;lt;");
  });

  it("leaves plain ASCII unchanged", () => {
    expect(escapeVttText("hello world")).toBe("hello world");
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

  it("treats trailing curly quote as part of terminator", () => {
    const a = w("\u201CRun.\u201D", 0, 0.4);
    const b = w("Then", 0.5, 0.8);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("handles final word without terminator as its own sentence", () => {
    const a = w("Hello.", 0, 0.4);
    const b = w("World", 0.5, 0.9);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("splits on Japanese/Chinese ideographic full stop \u3002", () => {
    const a = w("\u3053\u3093\u306B\u3061\u306F\u3002", 0, 0.5);
    const b = w("\u3055\u3088\u3046\u306A\u3089", 0.6, 1.0);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("splits on CJK fullwidth question and exclamation", () => {
    const a = w("\u8ab0\uFF1F", 0, 0.4);
    const b = w("\u3088\u3057\uFF01", 0.5, 0.9);
    const c = w("\u305D\u3046", 1.0, 1.3);
    expect(groupIntoSentences([a, b, c])).toEqual([[a], [b], [c]]);
  });

  it("splits on CJK terminator followed by closing corner bracket", () => {
    // "\u300C\u8d70\u308c\u3002\u300D" = 「走れ。」 — Japanese quoted dialog.
    const a = w("\u300C\u8d70\u308c\u3002\u300D", 0, 0.4);
    const b = w("\u305D\u3057\u3066", 0.5, 0.8);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("splits on Devanagari danda \u0964", () => {
    const a = w("\u0928\u092E\u0938\u094D\u0924\u0947\u0964", 0, 0.5);
    const b = w("\u0915\u0948\u0938\u0947", 0.6, 1.0);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("splits on Devanagari double danda \u0965", () => {
    const a = w("\u0936\u094D\u0932\u094B\u0915\u0965", 0, 0.5);
    const b = w("\u0905\u0917\u0932\u093E", 0.6, 1.0);
    expect(groupIntoSentences([a, b])).toEqual([[a], [b]]);
  });

  it("splits on Arabic question mark \u061F and full stop \u06D4", () => {
    const a = w("\u0643\u064A\u0641\u061F", 0, 0.4);
    const b = w("\u0623\u0647\u0644\u0627\u064B\u06D4", 0.5, 1.0);
    const c = w("\u0634\u0643\u0631\u0627", 1.1, 1.5);
    expect(groupIntoSentences([a, b, c])).toEqual([[a], [b], [c]]);
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

describe("wrapCueText", () => {
  it("returns a single line when under the limit", () => {
    expect(
      wrapCueText(["hello", "world"], { maxLineLength: 42, maxLines: 2 })
    ).toBe("hello world");
  });

  it("wraps to two lines greedily", () => {
    const words = ["this", "is", "a", "somewhat", "longer", "caption", "line"];
    const out = wrapCueText(words, { maxLineLength: 19, maxLines: 2 });
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].length).toBeLessThanOrEqual(19);
    expect(lines[1].length).toBeLessThanOrEqual(19);
    expect(lines.join(" ")).toBe(words.join(" "));
  });

  it("allows overflow rather than truncating when a single word exceeds the limit", () => {
    const out = wrapCueText(["supercalifragilistic"], {
      maxLineLength: 5,
      maxLines: 2,
    });
    expect(out).toBe("supercalifragilistic");
  });

  it("joins overflow words onto the final line when exceeding maxLines", () => {
    const words = ["a", "b", "c", "d", "e", "f"];
    const out = wrapCueText(words, { maxLineLength: 3, maxLines: 2 });
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines.join(" ").split(WHITESPACE)).toEqual(words);
  });
});

describe("timestampsToCaptions — SRT (default)", () => {
  it("returns empty string for empty input", () => {
    expect(timestampsToCaptions([])).toBe("");
  });

  it("renders a single short sentence as one cue", () => {
    const words: WordTimestamp[] = [w("Hello", 0, 0.5), w("world.", 0.5, 1.0)];
    const srt = timestampsToCaptions(words);
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:01,000\nHello world.\n\n");
  });

  it("emits sequential cue indices starting at 1", () => {
    const words: WordTimestamp[] = [
      w("One.", 0, 0.5),
      w("Two.", 0.6, 1.0),
      w("Three.", 1.1, 1.5),
    ];
    const srt = timestampsToCaptions(words);
    const indices = srt
      .split("\n\n")
      .filter(Boolean)
      .map((block) => block.split("\n")[0]);
    expect(indices).toEqual(["1", "2", "3"]);
  });

  it("uses first-word start and last-word end for each cue", () => {
    const words: WordTimestamp[] = [w("Alpha", 1.0, 1.3), w("beta.", 1.3, 1.7)];
    const srt = timestampsToCaptions(words);
    expect(srt).toContain("00:00:01,000 --> 00:00:01,700");
  });

  it("wraps long cues into two lines under 42 chars each", () => {
    const makeLongWords = (): WordTimestamp[] => {
      // 10 words of 5 chars each = ~59 chars with spaces, forces wrap.
      const out: WordTimestamp[] = [];
      for (let i = 0; i < 10; i++) {
        out.push(w(`word${i}`, i * 0.3, i * 0.3 + 0.3));
      }
      out[9] = { ...out[9], text: "word9." };
      return out;
    };
    const srt = timestampsToCaptions(makeLongWords());
    const body = srt.split("\n").slice(2, 4);
    expect(body).toHaveLength(2);
    for (const line of body) {
      expect(line.length).toBeLessThanOrEqual(42);
    }
  });

  it("normalizes typography in rendered output", () => {
    const words: WordTimestamp[] = [
      w("it\u2019s", 0, 0.3),
      w("\u201Cdone\u201D.", 0.3, 0.8),
    ];
    const srt = timestampsToCaptions(words);
    expect(srt).toContain("it's");
    expect(srt).toContain('"done".');
    expect(srt).not.toMatch(CURLY_QUOTES);
  });

  it("does not HTML-escape ampersand/lt/gt in SRT bodies", () => {
    const words: WordTimestamp[] = [
      w("Tom", 0, 0.3),
      w("&", 0.3, 0.4),
      w("Jerry.", 0.4, 0.9),
    ];
    const srt = timestampsToCaptions(words);
    expect(srt).toContain("Tom & Jerry.");
    expect(srt).not.toContain("&amp;");
  });

  it("honors custom options", () => {
    const words: WordTimestamp[] = [
      w("aaaa", 0, 0.3),
      w("bbbb", 0.3, 0.6),
      w("cccc.", 0.6, 1.0),
    ];
    const srt = timestampsToCaptions(words, {
      maxLineLength: 4,
      maxLinesPerCue: 1,
      maxCharsPerCue: 4,
    });
    const blocks = srt.split("\n\n").filter(Boolean);
    expect(blocks).toHaveLength(3);
  });

  it("ends with a trailing blank line per SRT convention", () => {
    const words: WordTimestamp[] = [w("Hi.", 0, 0.3)];
    const srt = timestampsToCaptions(words);
    expect(srt.endsWith("\n\n")).toBe(true);
  });
});

describe("timestampsToCaptions — VTT", () => {
  it("emits a minimal valid WEBVTT file for empty input", () => {
    // SRT returns "" for empty input, but WebVTT requires the WEBVTT signature
    // per W3C §3.1 — even a zero-cue file must start with the header.
    expect(timestampsToCaptions([], { format: "vtt" })).toBe("WEBVTT\n\n");
  });

  it("renders a single short sentence with WEBVTT header and period decimals", () => {
    const words: WordTimestamp[] = [w("Hello", 0, 0.5), w("world.", 0.5, 1.0)];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    expect(vtt).toBe(
      "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello world.\n\n"
    );
  });

  it("ends with a trailing blank line per WebVTT spec", () => {
    const words: WordTimestamp[] = [w("Hi.", 0, 0.3)];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    expect(vtt.endsWith("\n\n")).toBe(true);
  });

  it("uses period decimal separator in every timestamp", () => {
    const words: WordTimestamp[] = [w("One.", 0, 0.5), w("Two.", 0.6, 1.0)];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    expect(vtt).toContain("00:00:00.000 --> 00:00:00.500");
    expect(vtt).toContain("00:00:00.600 --> 00:00:01.000");
    expect(vtt).not.toContain(",");
  });

  it("starts with the WEBVTT header followed by a blank line", () => {
    const words: WordTimestamp[] = [w("Hi.", 0, 0.3)];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    expect(vtt.startsWith("WEBVTT\n\n")).toBe(true);
  });

  it("HTML-escapes ampersand, lt, and gt in cue bodies", () => {
    const words: WordTimestamp[] = [
      w("Tom", 0, 0.3),
      w("&", 0.3, 0.4),
      w("<Jerry>.", 0.4, 0.9),
    ];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    expect(vtt).toContain("Tom &amp; &lt;Jerry&gt;.");
    // The raw, unescaped form must not appear — any un-escaped `<` would be
    // parsed as the start of an inline WebVTT tag and silently swallow text.
    expect(vtt).not.toContain("Tom & <Jerry>.");
  });

  it("emits sequential cue indices starting at 1", () => {
    const words: WordTimestamp[] = [
      w("One.", 0, 0.5),
      w("Two.", 0.6, 1.0),
      w("Three.", 1.1, 1.5),
    ];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    const cueBlocks = vtt.split("\n\n").slice(1).filter(Boolean);
    const indices = cueBlocks.map((block) => block.split("\n")[0]);
    expect(indices).toEqual(["1", "2", "3"]);
  });

  it("normalizes typography in rendered output", () => {
    const words: WordTimestamp[] = [
      w("it\u2019s", 0, 0.3),
      w("\u201Cdone\u201D.", 0.3, 0.8),
    ];
    const vtt = timestampsToCaptions(words, { format: "vtt" });
    expect(vtt).toContain("it's");
    expect(vtt).toContain('"done".');
    expect(vtt).not.toMatch(CURLY_QUOTES);
  });
});
