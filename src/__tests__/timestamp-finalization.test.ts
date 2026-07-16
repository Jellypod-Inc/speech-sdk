import { describe, expect, it } from "vitest";
import { finalizeTimestamps } from "../timestamp-finalization.js";
import type { WordTimestamp } from "../timestamps.js";

const word = (text: string, start: number, end: number): WordTimestamp => ({
  text,
  start,
  end,
});

describe("finalizeTimestamps", () => {
  it("projects timings onto exact caller tokens with standalone punctuation", () => {
    const result = finalizeTimestamps({
      text: "Smishing -- phishing via SMS",
      timestamps: [
        word("Smishing", 0, 0.4),
        word("phishing", 0.5, 0.9),
        word("via", 1, 1.1),
        word("SMS", 1.2, 1.4),
      ],
    });

    expect(result).toEqual({
      ok: true,
      timestamps: [
        word("Smishing --", 0, 0.4),
        word("phishing", 0.5, 0.9),
        word("via", 1, 1.1),
        word("SMS", 1.2, 1.4),
      ],
    });
  });

  it("preserves leading, internal, and trailing punctuation from the input", () => {
    const result = finalizeTimestamps({
      text: "“ hello ” world ...",
      timestamps: [word("hello", 0, 0.3), word("world", 0.4, 0.7)],
    });

    expect(result).toEqual({
      ok: true,
      timestamps: [word("“ hello ”", 0, 0.3), word("world ...", 0.4, 0.7)],
    });
  });

  it("combines finer provider segmentation at exact caller boundaries", () => {
    const result = finalizeTimestamps({
      text: "mother-in-law",
      timestamps: [
        word("mother", 0, 0.2),
        word("in", 0.2, 0.3),
        word("law", 0.3, 0.5),
      ],
    });

    expect(result).toEqual({
      ok: true,
      timestamps: [word("mother-in-law", 0, 0.5)],
    });
  });

  it("supports Unicode normalization and non-whitespace scripts", () => {
    const decomposed = "cafe\u0301";
    expect(
      finalizeTimestamps({
        text: `café ${decomposed}`,
        timestamps: [word(decomposed, 0, 0.2), word("café", 0.3, 0.5)],
      })
    ).toMatchObject({ ok: true });
    expect(
      finalizeTimestamps({
        text: "你好世界。",
        timestamps: [
          word("你", 0, 0.1),
          word("好", 0.1, 0.2),
          word("世", 0.2, 0.3),
          word("界", 0.3, 0.4),
        ],
      })
    ).toEqual({
      ok: true,
      timestamps: [word("你好世界。", 0, 0.4)],
    });
  });

  it.each([
    [
      "normalized abbreviation",
      "Dr. Smith",
      [word("Doctor", 0, 0.2), word("Smith", 0.3, 0.5)],
    ],
    [
      "normalized number",
      "12 dollars",
      [word("twelve", 0, 0.3), word("dollars", 0.4, 0.7)],
    ],
    ["partial coverage", "hello world", [word("hello", 0, 0.3)]],
    [
      "extra coverage",
      "hello",
      [word("hello", 0, 0.3), word("world", 0.4, 0.7)],
    ],
    ["crossed caller boundary", "hello world", [word("helloworld", 0, 0.7)]],
    ["punctuation-only output", "hello", [word("--", 0, 0.1)]],
  ])("rejects %s", (_name, text, timestamps) => {
    expect(finalizeTimestamps({ text, timestamps })).toEqual({
      ok: false,
      reason: "transcript_mismatch",
    });
  });

  it("rejects empty timestamps for lexical text", () => {
    expect(finalizeTimestamps({ text: "hello", timestamps: [] })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("accepts empty timestamps for punctuation-only input", () => {
    expect(finalizeTimestamps({ text: "-- … ?", timestamps: [] })).toEqual({
      ok: true,
      timestamps: [],
    });
  });

  it.each([
    ["negative", [word("hello", -0.1, 0.2)], undefined],
    ["reversed", [word("hello", 0.3, 0.2)], undefined],
    ["non-finite start", [word("hello", Number.NaN, 0.2)], undefined],
    ["non-finite end", [word("hello", 0, Number.POSITIVE_INFINITY)], undefined],
    [
      "non-monotonic",
      [word("hello", 0.2, 0.5), word("world", 0.4, 0.7)],
      undefined,
    ],
    ["outside duration", [word("hello", 0, 2)], 500],
  ])("rejects %s timings", (_name, timestamps, audioDurationMs) => {
    expect(
      finalizeTimestamps({ text: "hello world", timestamps, audioDurationMs })
    ).toEqual({ ok: false, reason: "invalid_timing" });
  });
});
