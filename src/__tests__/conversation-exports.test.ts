import { describe, expect, it } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
  generateConversation,
  StitchUnsupportedError,
  TextChunkingUnsupportedError,
} from "../index.js";

describe("root conversation exports", () => {
  it("exports generateConversation", () => {
    expect(typeof generateConversation).toBe("function");
  });

  it("exports conversation error classes from ./conversation/errors", () => {
    expect(typeof ConversationInputError).toBe("function");
    expect(typeof DialogueConstraintError).toBe("function");
    expect(typeof StitchUnsupportedError).toBe("function");
  });

  it("exports chunking error classes from the root entry point", () => {
    expect(typeof TextChunkingUnsupportedError).toBe("function");
  });
});
