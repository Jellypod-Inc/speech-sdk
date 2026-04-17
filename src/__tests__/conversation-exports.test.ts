import { describe, expect, it } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
  generateConversation,
  StitchUnsupportedError,
} from "../index.js";

describe("public exports", () => {
  it("exports generateConversation", () => {
    expect(typeof generateConversation).toBe("function");
  });

  it("exports conversation error classes", () => {
    expect(typeof ConversationInputError).toBe("function");
    expect(typeof DialogueConstraintError).toBe("function");
    expect(typeof StitchUnsupportedError).toBe("function");
  });
});
