import { describe, expect, it } from "vitest";
import * as api from "../index.js";

describe("public exports", () => {
  it("exports generateConversation", () => {
    expect(typeof api.generateConversation).toBe("function");
  });

  it("exports conversation error classes", () => {
    expect(typeof api.ConversationInputError).toBe("function");
    expect(typeof api.DialogueConstraintError).toBe("function");
    expect(typeof api.StitchUnsupportedError).toBe("function");
  });
});
