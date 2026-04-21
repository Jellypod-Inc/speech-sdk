import { describe, expect, it } from "vitest";
import { formatSrtTime } from "../srt.js";

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
