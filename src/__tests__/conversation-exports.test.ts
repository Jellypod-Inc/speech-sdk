import { describe, expect, it } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "../conversation/errors.js";
import { generateConversation } from "../generate-conversation.js";

describe("./conversation subpath exports", () => {
  it("exports generateConversation", () => {
    expect(typeof generateConversation).toBe("function");
  });

  it("exports conversation error classes from ./conversation/errors", () => {
    expect(typeof ConversationInputError).toBe("function");
    expect(typeof DialogueConstraintError).toBe("function");
    expect(typeof StitchUnsupportedError).toBe("function");
  });
});
