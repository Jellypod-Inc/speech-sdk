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
  it.each(JELLYPOD_TAGS)("sends [%s] inline as written", async (tag) => {
    const { model, requests } = mockGoogle();
    const result = await generateSpeech({
      model,
      text: `[${tag}] Wait, [${tag}] that changes everything.`,
      voice: "Kore",
    });
    expect(requests[0][0].text).toBe(
      `<${tag}> Wait, <${tag}> that changes everything.`
    );
    expect(result.warnings).toBeUndefined();
  });

  it("keeps the caller's wording and case and leaves style to instructions", async () => {
    const { model, requests } = mockGoogle();
    await generateSpeech({
      model,
      text: "[ Genuinely Surprised ] Wait, [Laughs] that changes everything.",
      instructions: "calm narrator",
      voice: "Kore",
    });
    expect(requests[0]).toEqual([
      {
        type: "text",
        text: "<Genuinely Surprised> Wait, <Laughs> that changes everything.",
        annotations: [{ type: "speech_metadata", style: "calm narrator" }],
      },
    ]);
  });

  it("converts tags when streaming", async () => {
    const sse =
      'event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"audio","mime_type":"audio/l16","data":"AAAAAA=="}}\n\n';
    const fetch = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }));
    await streamSpeech({
      model: createGoogle({ apiKey: "key", fetch })(MODEL_ID),
      text: "[warmly] Hi there. [giggles]",
      voice: "Kore",
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.input[0].content).toEqual([
      { type: "text", text: "<warmly> Hi there. <giggles>" },
    ]);
  });

  it("sends inline tags in native dialogue", async () => {
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
        text: "<laughs> Yes. <chuckles> Wait, <excited> it was great.",
        annotations: [
          {
            type: "speech_metadata",
            speaker: "Speaker2",
            style: "podcast banter; upbeat",
          },
        ],
      },
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
      "<chuckles> I did. Wait, <excited> it was great."
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
