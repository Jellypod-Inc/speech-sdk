import { describe, expect, it } from "vitest";

const dictionaryIdsRegex = /dictionaryIds/i;

describe("public exports — pronunciations", () => {
  it("exports DictionaryIdsRequireGatewayError as a constructor", async () => {
    const mod = await import("../index.js");
    expect(typeof mod.DictionaryIdsRequireGatewayError).toBe("function");
    const err = new mod.DictionaryIdsRequireGatewayError();
    expect(err.name).toBe("DictionaryIdsRequireGatewayError");
    expect(err.message).toMatch(dictionaryIdsRegex);
  });
});
