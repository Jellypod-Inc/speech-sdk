import { describe, expect, it } from "vitest";
import { formatSrtTime, normalizeTypography } from "../srt.js";

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
