import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Pronunciation, PronunciationsInput } from "../index.js";
// biome-ignore lint/performance/noNamespaceImport: asserts the subpath's full export list
import * as pronunciations from "../pronunciations/index.js";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const IMPORT_SPECIFIER = /(?:import|export)\s[^;]*?from\s+"([^"]+)"/g;
const JS_EXTENSION = /\.js$/;
const PROVIDER_MODELS_FILE = /^providers\/[^/]+\/models\.ts$/;

function importGraph(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const visit = (file: string) => {
    if (files.has(file)) {
      return;
    }
    files.add(file);
    const source = readFileSync(join(SRC_DIR, file), "utf8");
    for (const [, specifier] of source.matchAll(IMPORT_SPECIFIER)) {
      if (specifier.startsWith(".")) {
        visit(
          normalize(join(dirname(file), specifier.replace(JS_EXTENSION, ".ts")))
        );
      } else {
        packages.add(specifier);
      }
    }
  };
  visit(entry);
  return { files: [...files], packages: [...packages] };
}

describe("public exports — pronunciations", () => {
  it("exposes PronunciationsInput with a rules array of Pronunciation", () => {
    const rule: Pronunciation = { word: "LLM", replacement: "el el em" };
    const input: PronunciationsInput = { rules: [rule] };
    expect(input.rules?.[0]).toEqual({ word: "LLM", replacement: "el el em" });
  });

  it("exports every pronunciations helper from the subpath", () => {
    expect(Object.keys(pronunciations).sort()).toEqual([
      "inverseAlign",
      "matchPronunciations",
      "mergeRules",
      "resolvePronunciations",
      "ruleMapKey",
      "substitute",
      "targetReadsIpa",
    ]);
  });

  it("stays browser-safe: no packages and no provider code beyond model lists", () => {
    const { files, packages } = importGraph("pronunciations/index.ts");
    expect(packages).toEqual([]);
    const providerFiles = files.filter((file) => file.startsWith("providers/"));
    for (const file of providerFiles) {
      expect(file).toMatch(PROVIDER_MODELS_FILE);
    }
  });
});
