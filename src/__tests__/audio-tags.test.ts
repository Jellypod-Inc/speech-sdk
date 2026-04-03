import { describe, expect, it } from "vitest";
import { detectAudioTags, stripAudioTags } from "../audio-tags.js";

describe("detectAudioTags", () => {
  it("finds single tag", () => {
    expect(detectAudioTags("[laugh] Hello")).toEqual(["[laugh]"]);
  });

  it("finds multiple tags", () => {
    expect(
      detectAudioTags("[laugh] Hello [pause] world [whisper] secret")
    ).toEqual(["[laugh]", "[pause]", "[whisper]"]);
  });

  it("returns empty array when no tags present", () => {
    expect(detectAudioTags("Hello world")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(detectAudioTags("")).toEqual([]);
  });

  it("detects tags with spaces inside", () => {
    expect(detectAudioTags("[French accent] Bonjour")).toEqual([
      "[French accent]",
    ]);
  });

  it("detects tags with numbers inside", () => {
    expect(detectAudioTags("[pause 2s] Hello")).toEqual(["[pause 2s]"]);
  });

  it("detects adjacent tags with no space", () => {
    expect(detectAudioTags("[laugh][cry] Hello")).toEqual(["[laugh]", "[cry]"]);
  });

  it("detects tag that is the entire string", () => {
    expect(detectAudioTags("[laugh]")).toEqual(["[laugh]"]);
  });

  it("does not detect unclosed brackets", () => {
    expect(detectAudioTags("[unclosed Hello world")).toEqual([]);
  });

  it("does not detect empty brackets", () => {
    expect(detectAudioTags("[] Hello world")).toEqual([]);
  });

  it("does not detect unopened brackets", () => {
    expect(detectAudioTags("unclosed] Hello world")).toEqual([]);
  });

  it("handles nested brackets by matching from first open to first close", () => {
    expect(detectAudioTags("[outer [inner]]")).toEqual(["[outer [inner]"]);
  });
});

describe("stripAudioTags", () => {
  it("strips single tag and returns warning", () => {
    const result = stripAudioTags("[laugh] Hello", "openai/tts-1");
    expect(result.text).toBe("Hello");
    expect(result.warnings).toEqual([
      "Audio tag [laugh] is not supported by openai/tts-1 and was removed.",
    ]);
  });

  it("strips multiple tags and returns warnings for each", () => {
    const result = stripAudioTags(
      "[laugh] Hello [whisper] world",
      "openai/tts-1"
    );
    expect(result.text).toBe("Hello world");
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings[0]).toContain("[laugh]");
    expect(result.warnings[1]).toContain("[whisper]");
  });

  it("returns original text and no warnings when no tags present", () => {
    const result = stripAudioTags("Hello world", "openai/tts-1");
    expect(result.text).toBe("Hello world");
    expect(result.warnings).toEqual([]);
  });

  it("returns empty string when text is only tags", () => {
    const result = stripAudioTags("[laugh] [sigh]", "openai/tts-1");
    expect(result.text).toBe("");
    expect(result.warnings).toHaveLength(2);
  });

  it("collapses extra whitespace after stripping", () => {
    const result = stripAudioTags("Hello [pause] world", "openai/tts-1");
    expect(result.text).toBe("Hello world");
  });

  it("trims leading/trailing whitespace after stripping", () => {
    const result = stripAudioTags("[laugh] Hello world [sigh]", "openai/tts-1");
    expect(result.text).toBe("Hello world");
  });

  it("includes model identifier in warning message", () => {
    const result = stripAudioTags("[laugh] Hi", "deepgram/aura-2");
    expect(result.warnings[0]).toBe(
      "Audio tag [laugh] is not supported by deepgram/aura-2 and was removed."
    );
  });
});
