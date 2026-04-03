import { describe, expect, it } from "vitest";
import { preprocessText } from "../preprocess-text.js";

describe("preprocessText", () => {
  it("expands numbers by default (no options)", () => {
    const result = preprocessText(
      "I bought 3 apples at the grocery store today"
    );
    expect(result.toLowerCase()).toContain("three");
  });

  it("expands numbers when symbolExpansion is true", () => {
    const result = preprocessText(
      "I bought 3 apples at the grocery store today",
      {
        symbolExpansion: true,
      }
    );
    expect(result.toLowerCase()).toContain("three");
  });

  it("does not expand when symbolExpansion is false", () => {
    const result = preprocessText(
      "I bought 3 apples at the grocery store today",
      {
        symbolExpansion: false,
      }
    );
    expect(result).toBe("I bought 3 apples at the grocery store today");
  });

  it("uses locale override when provided", () => {
    const result = preprocessText("Der Preis ist 3,14 Euro pro Stück", {
      symbolExpansion: true,
      locale: "de-DE",
    });
    expect(result.toLowerCase()).toContain("drei");
  });

  it("auto-detects French and expands correctly", () => {
    const result = preprocessText(
      "J'ai acheté 3 pommes au magasin aujourd'hui"
    );
    expect(result.toLowerCase()).toContain("trois");
  });

  it("falls back to en-US for short text", () => {
    const result = preprocessText("I have 42");
    expect(result.toLowerCase()).toContain("forty");
  });

  it("returns original text on empty input", () => {
    expect(preprocessText("")).toBe("");
  });

  it("never throws", () => {
    expect(() => preprocessText("Some text with 42 things")).not.toThrow();
  });
});
