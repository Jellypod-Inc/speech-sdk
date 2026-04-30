import { describe, expect, it } from "vitest";
import { SpeechSDKError } from "../errors.js";
import { DictionaryIdsRequireGatewayError } from "../pronunciations/errors.js";

describe("DictionaryIdsRequireGatewayError", () => {
  it("extends SpeechSDKError and has descriptive message", () => {
    const err = new DictionaryIdsRequireGatewayError();
    expect(err).toBeInstanceOf(SpeechSDKError);
    expect(err.name).toBe("DictionaryIdsRequireGatewayError");
    expect(err.message).toMatch(/dictionaryIds/i);
    expect(err.message).toMatch(/gateway/i);
  });
});
