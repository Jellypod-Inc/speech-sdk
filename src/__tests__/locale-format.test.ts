import { describe, expect, it } from "vitest";
import { getFormatInfo, resolveLocale } from "../locale-format.js";

describe("resolveLocale", () => {
  it("detects English from English text", () => {
    const locale = resolveLocale(
      "I went to the store to buy some apples and oranges"
    );
    expect(locale).toBe("en-US");
  });

  it("detects French from French text", () => {
    const locale = resolveLocale(
      "Je suis allé au magasin pour acheter des pommes"
    );
    expect(locale).toBe("fr-FR");
  });

  it("detects German from German text", () => {
    const locale = resolveLocale(
      "Ich bin in den Laden gegangen um Äpfel zu kaufen"
    );
    expect(locale).toBe("de-DE");
  });

  it("falls back to en-US for short text under 20 chars", () => {
    expect(resolveLocale("Hello world")).toBe("en-US");
  });

  it("falls back to en-US for empty text", () => {
    expect(resolveLocale("")).toBe("en-US");
  });

  it("uses provided locale override and skips detection", () => {
    const locale = resolveLocale(
      "Ich bin in den Laden gegangen um Äpfel zu kaufen",
      "fr-FR"
    );
    expect(locale).toBe("fr-FR");
  });
});

describe("getFormatInfo", () => {
  it("returns correct format info for en-US", () => {
    const info = getFormatInfo("en-US");
    expect(info.decimal).toBe(".");
    expect(info.group).toBe(",");
  });

  it("returns correct format info for fr-FR", () => {
    const info = getFormatInfo("fr-FR");
    expect(info.decimal).toBe(",");
    expect(info.group.charCodeAt(0)).toBe(8239);
  });

  it("returns correct format info for de-DE", () => {
    const info = getFormatInfo("de-DE");
    expect(info.decimal).toBe(",");
    expect(info.group).toBe(".");
  });

  it("memoizes results for the same locale", () => {
    const info1 = getFormatInfo("en-US");
    const info2 = getFormatInfo("en-US");
    expect(info1).toBe(info2);
  });
});
