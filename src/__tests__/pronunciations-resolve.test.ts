import { describe, expect, it } from "vitest";
import {
  mergeRules,
  type PronunciationRule,
  resolvePronunciations,
  ruleMapKey,
  substitute,
} from "../pronunciations/index.js";
import { targetReadsIpa } from "../pronunciations/ipa-models.js";
import { resolveModel, SUPPORTED_PROVIDER_IDS } from "../resolve-provider.js";
import { FEATURES, hasFeature } from "../speech-provider.js";

const OPENAI = { provider: "openai", model: "tts-1" } as const;
const GEMINI_38 = {
  provider: "google",
  model: "gemini-3.8-flash-tts",
} as const;

function keys(
  text: string,
  rules: readonly PronunciationRule[],
  target = OPENAI
) {
  return resolvePronunciations(text, rules, target).map((r) => r.ruleKey);
}

describe("resolvePronunciations", () => {
  const cities: PronunciationRule[] = [
    { word: "York", respelling: "yawk" },
    { word: "New York", respelling: "noo YAWK" },
  ];

  it("applies the longest rule and never re-matches its span", () => {
    expect(keys("I love New York", cities)).toEqual(["new york"]);
    expect(keys("York is old", cities)).toEqual(["york"]);
  });

  it("matches standalone words only", () => {
    const cat: PronunciationRule[] = [{ word: "cat", respelling: "kat" }];
    expect(keys("a category", cat)).toEqual([]);
    expect(keys("the cat's toy", cat)).toEqual(["cat"]);
  });

  it("honors caseSensitive", () => {
    const rules: PronunciationRule[] = [
      { word: "Cat", respelling: "kat", caseSensitive: true },
    ];
    expect(keys("feed the cat", rules)).toEqual([]);
    expect(resolvePronunciations("Cat nap", rules, OPENAI)).toEqual([
      {
        ruleKey: "Cat",
        word: "Cat",
        caseSensitive: true,
        replacement: "kat",
        form: "respelling",
      },
    ]);
  });

  it("treats non-ASCII letters as word characters", () => {
    expect(keys("a café", [{ word: "caf", respelling: "kaf" }])).toEqual([]);
    expect(
      keys("the éclair", [{ word: "ÉCLAIR", respelling: "ay-KLAIR" }])
    ).toEqual(["éclair"]);
  });

  it("returns each rule once, sorted by ruleKey, regardless of input order", () => {
    const rules: PronunciationRule[] = [
      { word: "zeta", respelling: "ZAY-tuh" },
      { word: "alpha", respelling: "AL-fuh" },
      { word: "Mu", respelling: "myoo", caseSensitive: true },
    ];
    const text = "zeta alpha zeta Mu alpha";
    expect(keys(text, rules)).toEqual(["Mu", "alpha", "zeta"]);
    expect(keys(text, [...rules].reverse())).toEqual(["Mu", "alpha", "zeta"]);
  });

  it("picks ipa only for models that read IPA", () => {
    const rules: PronunciationRule[] = [
      { word: "gif", respelling: "jif", ipa: "dʒɪf" },
    ];
    expect(resolvePronunciations("a gif", rules, GEMINI_38)[0]).toMatchObject({
      replacement: "dʒɪf",
      form: "ipa",
    });
    expect(
      resolvePronunciations("a gif", rules, {
        provider: "google",
        model: "gemini-2.5-flash-preview-tts",
      })[0]
    ).toMatchObject({ replacement: "jif", form: "respelling" });
    expect(resolvePronunciations("a gif", rules, OPENAI)[0]).toMatchObject({
      replacement: "jif",
      form: "respelling",
    });
  });

  it("uses the provider's default model when model is omitted", () => {
    const rules: PronunciationRule[] = [
      { word: "gif", respelling: "jif", ipa: "dʒɪf" },
    ];
    expect(
      resolvePronunciations("a gif", rules, { provider: "google" })[0]?.form
    ).toBe("ipa");
    expect(
      resolvePronunciations("a gif", rules, { provider: "openai" })[0]?.form
    ).toBe("respelling");
  });

  it("falls back to respelling when a rule has no ipa", () => {
    for (const ipa of [undefined, "", "  "]) {
      expect(
        resolvePronunciations(
          "a gif",
          [{ word: "gif", respelling: "jif", ipa }],
          GEMINI_38
        )[0]
      ).toMatchObject({ replacement: "jif", form: "respelling" });
    }
  });

  it("never resolves blank words and lets the last duplicate win", () => {
    expect(keys("a b", [{ word: " ", respelling: "x" }])).toEqual([]);
    expect(
      resolvePronunciations(
        "LLM",
        [
          { word: "LLM", respelling: "first" },
          { word: "llm", respelling: "second" },
        ],
        OPENAI
      )
    ).toEqual([
      {
        ruleKey: "llm",
        word: "llm",
        caseSensitive: false,
        replacement: "second",
        form: "respelling",
      },
    ]);
  });

  it("accepts legacy { word, replacement } rules as respellings", () => {
    expect(
      resolvePronunciations(
        "What is LLM?",
        [{ word: "LLM", replacement: "el el em" }],
        GEMINI_38
      )
    ).toEqual([
      {
        ruleKey: ruleMapKey("LLM", false),
        word: "LLM",
        caseSensitive: false,
        replacement: "el el em",
        form: "respelling",
      },
    ]);
  });

  it("tolerates untyped rules with a missing or null respelling", () => {
    const untyped = [
      { word: "LLM", replacement: "el el em", respelling: null },
      { word: "GPU", respelling: undefined },
    ] as unknown as PronunciationRule[];
    expect(resolvePronunciations("LLM on a GPU", untyped, OPENAI)).toEqual([
      {
        ruleKey: "llm",
        word: "LLM",
        caseSensitive: false,
        replacement: "el el em",
        form: "respelling",
      },
    ]);
  });

  it("reports the replacement synthesis substitutes", () => {
    const rules: PronunciationRule[] = [
      { word: "gif", respelling: "jif", ipa: "dʒɪf" },
    ];
    const [resolved] = resolvePronunciations("a gif", rules, GEMINI_38);
    expect(substitute("a gif", mergeRules(rules, { useIpa: true })).text).toBe(
      `a ${resolved?.replacement}`
    );
  });
});

const PARK_MILLER_MODULUS = 2_147_483_647;
const PARK_MILLER_MULTIPLIER = 48_271;

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * PARK_MILLER_MULTIPLIER) % PARK_MILLER_MODULUS;
    return state / PARK_MILLER_MODULUS;
  };
}

const VOCAB = [
  "new",
  "york",
  "New",
  "York",
  "cat",
  "Cat",
  "cats",
  "café",
  "caf",
  "é",
  "a",
  "A",
  "_",
  "1",
];
const SEPARATORS = [" ", "  ", "'", "-", ".", ",", "", "\n"];

function appliedKeys(
  text: string,
  ruleMap: ReturnType<typeof mergeRules>
): string[] {
  return [
    ...new Set(substitute(text, ruleMap).edits.map((edit) => edit.ruleKey)),
  ].sort();
}

describe("resolvePronunciations property", () => {
  it("resolves exactly the rule keys substitute edits with", () => {
    const random = seededRandom(20_260_930);
    const pick = <T>(items: readonly T[]): T =>
      items[Math.floor(random() * items.length)] as T;

    for (let run = 0; run < 500; run += 1) {
      const wordCount = 1 + Math.floor(random() * 12);
      const parts: string[] = [];
      for (let i = 0; i < wordCount; i += 1) {
        parts.push(pick(VOCAB), pick(SEPARATORS));
      }
      const text = parts.join("");

      const ruleCount = Math.floor(random() * 6);
      const rules: PronunciationRule[] = [];
      for (let i = 0; i < ruleCount; i += 1) {
        const word =
          random() < 0.3 ? `${pick(VOCAB)} ${pick(VOCAB)}` : pick(VOCAB);
        rules.push({
          word: random() < 0.1 ? " " : word,
          respelling: random() < 0.1 ? "" : `r${i}`,
          ...(random() < 0.5 && { ipa: random() < 0.2 ? " " : `i${i}` }),
          caseSensitive: random() < 0.4,
        });
      }

      const target = random() < 0.5 ? OPENAI : GEMINI_38;
      const ruleMap = mergeRules(rules, { useIpa: targetReadsIpa(target) });
      expect(keys(text, rules, target)).toEqual(appliedKeys(text, ruleMap));
    }
  });
});

describe("IPA_PRONUNCIATION_MODELS", () => {
  it("matches every registered model's ipa-pronunciation feature", () => {
    for (const providerId of SUPPORTED_PROVIDER_IDS) {
      const { provider } = resolveModel(`${providerId}/any`);
      if (provider.defaultModel) {
        expect(targetReadsIpa({ provider: providerId })).toBe(
          targetReadsIpa({ provider: providerId, model: provider.defaultModel })
        );
      }
      for (const model of provider.models ?? []) {
        expect(
          targetReadsIpa({ provider: providerId, model: model.id }),
          `${providerId}/${model.id}`
        ).toBe(hasFeature(model, FEATURES.IPA_PRONUNCIATION));
      }
    }
  });
});
