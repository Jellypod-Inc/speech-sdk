import { describe, expect, it } from "vitest";
import type { Pronunciation, PronunciationsInput } from "../index.js";

describe("public exports — pronunciations", () => {
  it("exposes PronunciationsInput with a rules array of Pronunciation", () => {
    const rule: Pronunciation = { word: "LLM", replacement: "el el em" };
    const input: PronunciationsInput = { rules: [rule] };
    expect(input.rules?.[0]).toEqual({ word: "LLM", replacement: "el el em" });
  });
});
