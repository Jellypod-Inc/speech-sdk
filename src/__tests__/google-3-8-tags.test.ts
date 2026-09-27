import { describe, expect, it, vi } from "vitest";
import { wrapPcm16Mono } from "../audio-utils.js";
import { generateConversation } from "../generate-conversation.js";
import { generateSpeech } from "../generate-speech.js";
import {
  createGoogle,
  GoogleSpeechProvider,
} from "../providers/google/index.js";
import { streamSpeech } from "../stream-speech.js";

const MODEL_ID = "gemini-3.8-flash-tts";
const RATE = 24_000;
const WORD_MS = 200;
const GAP_MS = 300;
const WHITESPACE = /\s+/;
const INLINE_TAG = /<[^>]+>/g;
const BRACKET = /[[\]]/;

// Tags from three real two-host Jellypod scripts.
const JELLYPOD_TAGS = [
  "skeptical",
  "laughs",
  "matter-of-fact",
  "chuckles",
  "warmly",
  "thoughtfully",
  "reflective",
  "pauses",
  "hesitates",
  "curious",
  "rushed",
  "measured",
  "interrupts",
  "genuinely surprised",
  "excited",
  "dramatically",
  "deliberate",
] as const;

interface ContentItem {
  annotations?: { type: string; speaker?: string; style?: string }[];
  text: string;
}

function spokenWords(text: string): string[] {
  return text.replace(INLINE_TAG, " ").split(WHITESPACE).filter(Boolean);
}

function samples(ms: number): number {
  return Math.round((ms / 1000) * RATE);
}

// One 200 ms tone per spoken word, 300 ms of silence between content items.
function renderContent(content: readonly ContentItem[]): Int16Array {
  const parts: Int16Array[] = [];
  for (const [index, item] of content.entries()) {
    if (index > 0) {
      parts.push(new Int16Array(samples(GAP_MS)));
    }
    for (const _ of spokenWords(item.text)) {
      const tone = new Int16Array(samples(WORD_MS));
      for (let i = 0; i < tone.length; i++) {
        tone[i] = Math.round(8000 * Math.sin((2 * Math.PI * 220 * i) / RATE));
      }
      parts.push(tone);
    }
  }
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function mockGoogle() {
  const requests: ContentItem[][] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    const content = body.input[0].content as ContentItem[];
    requests.push(content);
    const pcm = renderContent(content);
    const wav = await wrapPcm16Mono(new Uint8Array(pcm.buffer), RATE);
    return new Response(
      JSON.stringify({
        id: `request-${requests.length}`,
        status: "completed",
        steps: [
          {
            type: "model_output",
            content: [
              {
                type: "audio",
                mime_type: "audio/wav",
                data: Buffer.from(wav).toString("base64"),
              },
            ],
          },
        ],
      }),
      { status: 200 }
    );
  });
  const model = createGoogle({
    apiKey: "key",
    fetch: fetch as typeof globalThis.fetch,
  })(MODEL_ID);
  return { fetch, model, requests };
}

describe("Gemini 3.8 bracket tags", () => {
  it.each(JELLYPOD_TAGS)("sends [%s] as an inline tag", async (tag) => {
    const { model, requests } = mockGoogle();
    await generateSpeech({
      model,
      text: `[${tag}] Wait, [${tag}] that changes everything.`,
      voice: "Kore",
    });
    const [item] = requests[0];
    expect(item.text).not.toMatch(BRACKET);
    const inline =
      { laughs: "<laugh>", chuckles: "<laugh>", pauses: "<short pause>" }[
        tag as string
      ] ?? `<${tag}>`;
    expect(item.text).toBe(
      `${inline} Wait, ${inline} that changes everything.`
    );
  });

  it.each([
    ["chuckles", "<laugh>"],
    ["Chuckle", "<laugh>"],
    ["laughing", "<laugh>"],
    ["giggles", "<laugh>"],
    ["exhales", "<sigh>"],
    ["sighing", "<sigh>"],
    ["inhales", "<breath>"],
    ["breathes", "<breath>"],
    ["pause", "<short pause>"],
    ["PAUSES", "<short pause>"],
  ])("maps [%s] to %s", async (tag, inline) => {
    const { model, requests } = mockGoogle();
    await generateSpeech({
      model,
      text: `That's wild. [${tag}] Really.`,
      voice: "Kore",
    });
    expect(requests[0][0]).toEqual({
      type: "text",
      text: `That's wild. ${inline} Really.`,
    });
  });

  it("keeps arbitrary tags in place and leaves the style to caller instructions", async () => {
    const { model, requests } = mockGoogle();
    await generateSpeech({
      model,
      text: "[Genuinely  Surprised] Wait, [excited] that changes everything.",
      instructions: "calm narrator",
      voice: "Kore",
    });
    expect(requests[0]).toEqual([
      {
        type: "text",
        text: "<genuinely surprised> Wait, <excited> that changes everything.",
        annotations: [{ type: "speech_metadata", style: "calm narrator" }],
      },
    ]);
  });

  it("reports synonym mappings in one warning per request", async () => {
    const { model } = mockGoogle();
    const result = await generateSpeech({
      model,
      text: "[skeptical] Hmm. [Chuckles] Fine. [laughs] [chuckles] [pauses] Okay.",
      voice: "Kore",
    });
    expect(result.warnings).toEqual([
      "google/gemini-3.8-flash-tts: mapped audio tags onto Gemini 3.8 inline tags: [chuckles] → <laugh>, [pauses] → <short pause>.",
    ]);
  });

  it("adds no warning for documented or arbitrary tags", async () => {
    const { model } = mockGoogle();
    const result = await generateSpeech({
      model,
      text: "Hello [laughs] world. [skeptical] [short pause] Bye.",
      voice: "Kore",
    });
    expect(result.warnings).toBeUndefined();
  });

  it("converts tags when streaming", async () => {
    const sse =
      'event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"audio","mime_type":"audio/l16","data":"AAAAAA=="}}\n\n';
    const fetch = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }));
    const result = await streamSpeech({
      model: createGoogle({ apiKey: "key", fetch })(MODEL_ID),
      text: "[warmly] Hi there. [giggles]",
      voice: "Kore",
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.input[0].content).toEqual([
      { type: "text", text: "<warmly> Hi there. <laugh>" },
    ]);
    expect(result.warnings).toEqual([
      "google/gemini-3.8-flash-tts: mapped audio tags onto Gemini 3.8 inline tags: [giggles] → <laugh>.",
    ]);
  });

  it("sends inline tags in native dialogue and keeps one warning for the request", async () => {
    const { model, requests } = mockGoogle();
    const result = await generateConversation({
      model,
      instructions: "podcast banter",
      turns: [
        { voice: "Kore", text: "[skeptical] You tried it?" },
        {
          voice: "Puck",
          text: "[laughs] Yes. [chuckles] Wait, [excited] it was great.",
          instructions: "upbeat",
        },
      ],
    });
    expect(result.metadata.path).toBe("native");
    expect(requests[0]).toEqual([
      {
        type: "text",
        text: "<skeptical> You tried it?",
        annotations: [
          {
            type: "speech_metadata",
            speaker: "Speaker1",
            style: "podcast banter",
          },
        ],
      },
      {
        type: "text",
        text: "<laugh> Yes. <laugh> Wait, <excited> it was great.",
        annotations: [
          {
            type: "speech_metadata",
            speaker: "Speaker2",
            style: "podcast banter; upbeat",
          },
        ],
      },
    ]);
    expect(result.warnings).toEqual([
      "google/gemini-3.8-flash-tts: mapped audio tags onto Gemini 3.8 inline tags: [chuckles] → <laugh>.",
    ]);
  });

  it("keeps one clip per input turn with unchanged turn indexes under splitTurns", async () => {
    const { model, requests } = mockGoogle();
    const turns = [
      { voice: "Kore", text: "[skeptical] So you tried the ramen place." },
      {
        voice: "Puck",
        text: "[chuckles] I did. Wait, [excited] it was great.",
      },
      { voice: "Kore", text: "[matter-of-fact] The line was long." },
      {
        voice: "Puck",
        text: "[genuinely surprised] Worth it though. [pauses]",
      },
    ];
    // Words are spoken back to back in 200 ms tones with a 300 ms gap between turns.
    const align = vi.fn(({ text }: { text: string }) => {
      const perTurn = requests[0].map((item) => spokenWords(item.text).length);
      const words = text.split(WHITESPACE);
      expect(words).toHaveLength(perTurn.reduce((a, b) => a + b, 0));
      const out: { text: string; start: number; end: number }[] = [];
      let cursorMs = 0;
      let wordIndex = 0;
      for (const [turnIndex, count] of perTurn.entries()) {
        if (turnIndex > 0) {
          cursorMs += GAP_MS;
        }
        for (let i = 0; i < count; i++) {
          out.push({
            text: words[wordIndex++],
            start: cursorMs / 1000,
            end: (cursorMs + WORD_MS) / 1000,
          });
          cursorMs += WORD_MS;
        }
      }
      return Promise.resolve(out);
    });

    const result = await generateConversation({
      model,
      turns,
      timestamps: true,
      timestampProvider: { align },
      splitTurns: true,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toHaveLength(turns.length);
    expect(result.turns.map((turn) => turn.turnIndex)).toEqual([0, 1, 2, 3]);
    expect([...new Set(result.timestamps?.map((w) => w.turnIndex))]).toEqual([
      0, 1, 2, 3,
    ]);
    expect(result.turns[1].timestamps.map((w) => w.text)).toEqual([
      "I",
      "did.",
      "Wait,",
      "it",
      "was",
      "great.",
    ]);
    expect(requests[0][1].text).toBe(
      "<laugh> I did. Wait, <excited> it was great."
    );
  });
});

describe("other Google models", () => {
  it("still strip bracket tags on Gemini 2.5", () => {
    const provider = new GoogleSpeechProvider({ apiKey: "key" });
    expect(
      provider.processAudioTags(
        "[skeptical] Hi.",
        "gemini-2.5-flash-preview-tts"
      )
    ).toEqual({
      text: "Hi.",
      warnings: [
        "Audio tag [skeptical] is not supported by google/gemini-2.5-flash-preview-tts and was removed.",
      ],
    });
  });
});
