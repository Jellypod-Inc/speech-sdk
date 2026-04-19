import { describe, expect, it } from "vitest";
import { ConversationInputError } from "../conversation/errors.js";
import { validateConversationInput } from "../conversation/validate.js";

const TEXT_EMPTY_RE = /text must not be empty/i;
const MODEL_REQUIRED_RE = /model must be set/i;

describe("validateConversationInput", () => {
  const base = {
    model: "openai/tts-1",
    turns: [
      { voice: "nova", text: "Hi." },
      { voice: "shimmer", text: "Hello." },
    ],
  };

  it("accepts a valid 2-turn conversation", () => {
    expect(() => validateConversationInput(base)).not.toThrow();
  });

  it("rejects empty turns", () => {
    expect(() => validateConversationInput({ ...base, turns: [] })).toThrow(
      ConversationInputError
    );
  });

  it("rejects turn with empty text", () => {
    expect(() =>
      validateConversationInput({
        ...base,
        turns: [{ voice: "nova", text: "" }],
      })
    ).toThrow(TEXT_EMPTY_RE);
  });

  it("rejects turn with whitespace-only text", () => {
    expect(() =>
      validateConversationInput({
        ...base,
        turns: [{ voice: "nova", text: "   " }],
      })
    ).toThrow(TEXT_EMPTY_RE);
  });

  it("accepts more than 4 unique voices", () => {
    expect(() =>
      validateConversationInput({
        ...base,
        turns: [
          { voice: "a", text: "1" },
          { voice: "b", text: "2" },
          { voice: "c", text: "3" },
          { voice: "d", text: "4" },
          { voice: "e", text: "5" },
        ],
      })
    ).not.toThrow();
  });

  it("rejects turn with neither top-level nor per-turn model", () => {
    expect(() =>
      validateConversationInput({
        turns: [{ voice: "a", text: "Hi." }],
      })
    ).toThrow(MODEL_REQUIRED_RE);
  });

  it("accepts per-turn model when top-level is missing", () => {
    expect(() =>
      validateConversationInput({
        turns: [
          { voice: "a", text: "Hi.", model: "openai/tts-1" },
          { voice: "b", text: "Hey.", model: "openai/tts-1" },
        ],
      })
    ).not.toThrow();
  });

  it("voice equality uses deep equality for object voices", () => {
    const v = { url: "https://example.com/a.wav" };
    expect(() =>
      validateConversationInput({
        ...base,
        turns: [
          { voice: v, text: "1" },
          { voice: v, text: "2" },
        ],
      })
    ).not.toThrow();
  });
});
