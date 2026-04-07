import { describe, expect, it } from "vitest";
import { buildOpenAIInstructionsFromTags } from "../providers/openai/instructions.js";

describe("buildOpenAIInstructionsFromTags", () => {
  it("returns text unchanged and undefined instructions when no tags", () => {
    const r = buildOpenAIInstructionsFromTags("Hello world");
    expect(r.text).toBe("Hello world");
    expect(r.instructions).toBeUndefined();
  });

  it("emits a single Speak directive when one tag covers the whole input", () => {
    const r = buildOpenAIInstructionsFromTags("[cheerfully] Hi John");
    expect(r.text).toBe("Hi John");
    expect(r.instructions).toBe("Speak cheerfully.");
  });

  it("emits an ordered-shift directive for multiple tags", () => {
    const r = buildOpenAIInstructionsFromTags(
      "[cheerfully] Hi John how are you? [soft] I'm feeling great"
    );
    expect(r.text).toBe("Hi John how are you? I'm feeling great");
    expect(r.instructions).toBe(
      "Delivery shifts through the text in order: begin cheerfully, then soft."
    );
  });

  it("combines consecutive tags for the same position", () => {
    const r = buildOpenAIInstructionsFromTags("[excited][loud] Go team!");
    expect(r.text).toBe("Go team!");
    expect(r.instructions).toBe("Speak excited, loud.");
  });

  it("prepends 'begin neutrally' when there is leading untagged text", () => {
    const r = buildOpenAIInstructionsFromTags("Hi there [whisper] come closer");
    expect(r.text).toBe("Hi there come closer");
    expect(r.instructions).toBe(
      "Delivery shifts through the text in order: begin neutrally, then whisper."
    );
  });

  it("folds a trailing tag with no following text into the sequence", () => {
    const r = buildOpenAIInstructionsFromTags("Hello world [laugh]");
    expect(r.text).toBe("Hello world");
    expect(r.instructions).toBe(
      "Delivery shifts through the text in order: begin neutrally, then laugh."
    );
  });

  it("treats a tag-only input as a single Speak directive with empty text", () => {
    const r = buildOpenAIInstructionsFromTags("[laugh]");
    expect(r.text).toBe("");
    expect(r.instructions).toBe("Speak laugh.");
  });

  it("handles three distinct tag positions", () => {
    const r = buildOpenAIInstructionsFromTags(
      "[cheerfully] Hello. [soft] Quiet part. [excited] Big finish!"
    );
    expect(r.text).toBe("Hello. Quiet part. Big finish!");
    expect(r.instructions).toBe(
      "Delivery shifts through the text in order: begin cheerfully, then soft, then excited."
    );
  });

  it("lowercases and trims tag content", () => {
    const r = buildOpenAIInstructionsFromTags("[  CHEERFULLY  ] Hi");
    expect(r.instructions).toBe("Speak cheerfully.");
  });

  it("collapses whitespace in cleaned text", () => {
    const r = buildOpenAIInstructionsFromTags("Hi    [pause]    there");
    expect(r.text).toBe("Hi there");
  });

  it("handles multi-word tags", () => {
    const r = buildOpenAIInstructionsFromTags("[French accent] Bonjour");
    expect(r.instructions).toBe("Speak french accent.");
  });
});
