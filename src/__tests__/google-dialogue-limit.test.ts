import { describe, expect, it, vi } from "vitest";
import { DialogueConstraintError } from "../conversation/errors.js";
import { generateConversation } from "../generate-conversation.js";
import { createGoogle } from "../providers/google/index.js";
import { streamConversation } from "../stream-conversation.js";

const AT_MOST_8000 = /at most 8000 characters/;
const GEMINI_3_8 = "gemini-3.8-flash-tts";
const GEMINI_3_8_LITE = "gemini-3.8-flash-lite-tts";
const GEMINI_2_5 = "gemini-2.5-flash-preview-tts";

function wrapPcmAsWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const wav = new Uint8Array(44 + pcm.length);
  const view = new DataView(wav.buffer);
  const tag = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, pcm.length, true);
  wav.set(pcm, 44);
  return wav;
}

const turnsOfChars = (lengths: readonly number[]) =>
  lengths.map((n, i) => ({
    voice: i % 2 === 0 ? "Kore" : "Puck",
    text: "x".repeat(n),
  }));

describe("Google dialogueCapabilities", () => {
  it("resolves maxTotalChars per model", () => {
    for (const [model, maxTotalChars, streaming] of [
      [GEMINI_3_8, 8000, true],
      [GEMINI_3_8_LITE, 8000, true],
      [GEMINI_2_5, 2500, false],
    ] as const) {
      const { provider } = createGoogle({ apiKey: "k" })(model);
      expect(provider.dialogueCapabilities?.(model)).toEqual({
        maxVoices: 2,
        maxTotalChars,
        streaming,
      });
    }
  });
});

describe("Google native dialogue limit", () => {
  const pcm = new Uint8Array(new Int16Array(2400).fill(6000).buffer);
  const audio = wrapPcmAsWav(pcm, 24_000);

  async function blocksFor(lengths: readonly number[], modelId = GEMINI_3_8) {
    const model = createGoogle({ apiKey: "k" })(modelId);
    const generateDialogue = vi
      .spyOn(model.provider, "generateDialogue" as never)
      .mockResolvedValue({
        audio,
        mediaType: "audio/wav",
      } as never);
    await generateConversation({
      model,
      turns: turnsOfChars(lengths),
      gapMs: 0,
    });
    return generateDialogue.mock.calls.length;
  }

  it("keeps a 3.8 conversation at the limit in one native call", async () => {
    expect(await blocksFor([4000, 4000])).toBe(1);
  });

  it("splits a 3.8 conversation one character over the limit into parallel blocks", async () => {
    expect(await blocksFor([4000, 4000, 1, 1])).toBe(2);
  });

  it("still splits a pre-3.8 conversation at 2500", async () => {
    expect(await blocksFor([1250, 1250], GEMINI_2_5)).toBe(1);
    expect(await blocksFor([1250, 1250, 1, 1], GEMINI_2_5)).toBe(2);
  });
});

describe("streamConversation limit", () => {
  it("throws a constraint error past maxTotalChars", async () => {
    const model = createGoogle({ apiKey: "k", fetch: vi.fn() })(GEMINI_3_8);
    const promise = streamConversation({
      model,
      turns: turnsOfChars([4000, 4000, 1]),
    });
    await expect(promise).rejects.toBeInstanceOf(DialogueConstraintError);
    await expect(promise).rejects.toThrow(AT_MOST_8000);
  });
});
