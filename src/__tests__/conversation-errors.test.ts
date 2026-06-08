import { describe, expect, it } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "../conversation/errors.js";
import {
  ApiError,
  SpeechSDKError,
  VoiceResolutionError,
  withTurnIndex,
} from "../errors.js";

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
      provider: "some-provider",
      model: "some-model",
    });
    expect(e).toBeInstanceOf(SpeechSDKError);
    expect(e.name).toBe("StitchUnsupportedError");
    expect(e.message).toContain("some-provider/some-model");
  });

  // VoiceResolutionError extends ApiError; the conversation stitch path wraps
  // per-turn errors via withTurnIndex. The wrapping must preserve the typed
  // subclass so callers' `err instanceof VoiceResolutionError` / `err.reason`
  // checks keep working across the conversation boundary.
  it("withTurnIndex preserves VoiceResolutionError subclass + reason + voiceId", () => {
    const original = new VoiceResolutionError(
      "not_found",
      "v_abc123",
      {
        statusCode: 404,
        code: "voice_not_found",
        responseBody: { detail: "no voice with id 'v_abc123'" },
      }
    );
    const wrapped = withTurnIndex(original, 2);
    expect(wrapped).toBeInstanceOf(VoiceResolutionError);
    expect(wrapped).toBeInstanceOf(ApiError);
    const ve = wrapped as VoiceResolutionError;
    expect(ve.reason).toBe("not_found");
    expect(ve.voiceId).toBe("v_abc123");
    expect(ve.statusCode).toBe(404);
    expect(ve.code).toBe("voice_not_found");
    expect(ve.turnIndex).toBe(2);
    expect(ve.responseBody).toEqual({ detail: "no voice with id 'v_abc123'" });
    expect(ve.cause).toBe(original);
  });
});
