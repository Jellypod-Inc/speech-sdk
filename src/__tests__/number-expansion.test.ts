import { describe, expect, it } from "vitest";
import { expandNumbers } from "../number-expansion.js";

describe("expandNumbers", () => {
  describe("plain integers", () => {
    it("expands a simple integer", () => {
      const result = expandNumbers("I have 3 apples", "en-US");
      expect(result.toLowerCase()).toContain("three");
      expect(result).not.toContain("3");
    });

    it("expands zero", () => {
      const result = expandNumbers("There are 0 items left", "en-US");
      expect(result.toLowerCase()).toContain("zero");
    });
  });

  describe("grouped integers", () => {
    it("expands comma-grouped number in en-US", () => {
      const result = expandNumbers("Population is 1,000,000 people", "en-US");
      expect(result.toLowerCase()).toContain("one million");
    });

    it("expands dot-grouped number in de-DE", () => {
      const result = expandNumbers(
        "Bevölkerung ist 1.000.000 Menschen",
        "de-DE"
      );
      expect(result.toLowerCase()).not.toContain("1.000.000");
    });

    it("does not expand invalid grouping like 1,00", () => {
      expect(expandNumbers("code 1,00 here", "en-US")).toBe("code 1,00 here");
    });
  });

  describe("decimals", () => {
    it("expands decimal with dot in en-US", () => {
      const result = expandNumbers("Pi is about 3.14", "en-US");
      expect(result.toLowerCase()).toContain("three");
      expect(result).not.toContain("3.14");
    });

    it("expands decimal with comma in fr-FR", () => {
      const result = expandNumbers("Le prix est environ 3,14 euros", "fr-FR");
      expect(result.toLowerCase()).toContain("trois");
    });
  });

  describe("currency", () => {
    it("expands prefix currency symbol like $50", () => {
      const result = expandNumbers("It costs $50 to enter", "en-US");
      expect(result.toLowerCase()).toContain("fifty");
      expect(result.toLowerCase()).toContain("dollar");
    });

    it("expands suffix currency symbol like 50€", () => {
      const result = expandNumbers("Le billet coûte 50€ par personne", "fr-FR");
      expect(result.toLowerCase()).toContain("cinquante");
    });

    it("expands currency with decimals like $4.50", () => {
      const result = expandNumbers("It costs $4.50 to enter", "en-US");
      expect(result.toLowerCase()).toContain("four");
    });
  });

  describe("ordinals (English only)", () => {
    it("expands 1st", () => {
      const result = expandNumbers("She came in 1st place", "en-US");
      expect(result.toLowerCase()).toContain("first");
    });

    it("expands 3rd", () => {
      const result = expandNumbers("He finished 3rd overall", "en-US");
      expect(result.toLowerCase()).toContain("third");
    });
  });

  describe("patterns that should NOT be expanded", () => {
    it("does not expand numbers adjacent to letters", () => {
      expect(expandNumbers("Flight B747 departs soon", "en-US")).toBe(
        "Flight B747 departs soon"
      );
    });

    it("does not expand H2O", () => {
      expect(expandNumbers("Drink H2O daily", "en-US")).toBe("Drink H2O daily");
    });

    it("does not expand 4-digit standalone numbers (likely years)", () => {
      expect(expandNumbers("Founded in 2024 by engineers", "en-US")).toBe(
        "Founded in 2024 by engineers"
      );
    });

    it("does not expand numbers longer than 15 digits", () => {
      expect(expandNumbers("ID: 1234567890123456 is here", "en-US")).toBe(
        "ID: 1234567890123456 is here"
      );
    });

    it("does not expand numbers in ranges", () => {
      expect(expandNumbers("Between 50-100 items", "en-US")).toBe(
        "Between 50-100 items"
      );
    });
  });

  describe("fallback behavior", () => {
    it("handles text with no numbers unchanged", () => {
      expect(expandNumbers("Hello world", "en-US")).toBe("Hello world");
    });

    it("handles empty string", () => {
      expect(expandNumbers("", "en-US")).toBe("");
    });

    it("never throws on invalid locale", () => {
      expect(() => expandNumbers("I have 42 items", "xx-XX")).not.toThrow();
    });
  });
});
