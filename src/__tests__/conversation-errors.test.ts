import { describe, expect, it } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "../conversation/errors.js";
import { SpeechSDKError } from "../errors.js";

describe("conversation errors", () => {
  it("ConversationInputError extends SpeechSDKError", () => {
    const e = new ConversationInputError("bad turns");
    expect(e).toBeInstanceOf(SpeechSDKError);
    expect(e.name).toBe("ConversationInputError");
    expect(e.message).toBe("bad turns");
  });

  it("DialogueConstraintError captures provider, model, rule, observed", () => {
    const e = new DialogueConstraintError({
      provider: "google",
      model: "gemini-3.1-flash-tts-preview",
      rule: "exactly 2 unique voices",
      observed: "3 unique voices",
    });
    expect(e).toBeInstanceOf(SpeechSDKError);
    expect(e.name).toBe("DialogueConstraintError");
    expect(e.provider).toBe("google");
    expect(e.model).toBe("gemini-3.1-flash-tts-preview");
    expect(e.message).toContain("google/gemini-3.1-flash-tts-preview");
    expect(e.message).toContain("exactly 2 unique voices");
    expect(e.message).toContain("3 unique voices");
  });

  it("StitchUnsupportedError names offending provider/model", () => {
    const e = new StitchUnsupportedError({
      provider: "unreal-speech",
      model: "Scarlett",
    });
    expect(e).toBeInstanceOf(SpeechSDKError);
    expect(e.name).toBe("StitchUnsupportedError");
    expect(e.message).toContain("unreal-speech/Scarlett");
  });
});
