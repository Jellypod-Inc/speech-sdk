import { describe, expect, it } from "vitest";
import { ConversationInputError } from "../conversation/errors.js";
import { validateConversationInput } from "../conversation/validate.js";

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
    ).toThrow(ConversationInputError);
  });

  it("rejects turn with whitespace-only text", () => {
    expect(() =>
      validateConversationInput({
        ...base,
        turns: [{ voice: "nova", text: "   " }],
      })
    ).toThrow(ConversationInputError);
  });

  it("rejects turn with neither top-level nor per-turn model", () => {
    expect(() =>
      validateConversationInput({
        turns: [{ voice: "a", text: "Hi." }],
      })
    ).toThrow(ConversationInputError);
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

  it("rejects mixing top-level model with a per-turn model override", () => {
    expect(() =>
      validateConversationInput({
        model: "openai/tts-1",
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hey.", model: "elevenlabs/eleven_v3" },
        ],
      })
    ).toThrow(ConversationInputError);
  });

  it("rejects mixing top-level model with a per-turn model on every turn", () => {
    expect(() =>
      validateConversationInput({
        model: "openai/tts-1",
        turns: [
          { voice: "a", text: "Hi.", model: "openai/tts-1" },
          { voice: "b", text: "Hey.", model: "openai/tts-1" },
        ],
      })
    ).toThrow(ConversationInputError);
  });

  it("rejects per-turn model on some turns when top-level is missing", () => {
    expect(() =>
      validateConversationInput({
        turns: [
          { voice: "a", text: "Hi.", model: "openai/tts-1" },
          { voice: "b", text: "Hey." },
        ],
      })
    ).toThrow(ConversationInputError);
  });
});
