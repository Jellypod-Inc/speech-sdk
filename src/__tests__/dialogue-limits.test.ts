import { describe, expect, it, vi } from "vitest";
import { DialogueConstraintError } from "../conversation/errors.js";
import { getDialogueLimits } from "../dialogue-limits.js";
import { generateConversation } from "../generate-conversation.js";
import { createGoogle } from "../providers/google/index.js";
import { streamConversation } from "../stream-conversation.js";

const AT_MOST_2500 = /at most 2500 characters/;
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

describe("getDialogueLimits", () => {
  it("resolves limits per Google model from a string or a resolved model", () => {
    for (const model of [GEMINI_3_8, GEMINI_3_8_LITE, GEMINI_2_5]) {
      expect(getDialogueLimits(`google/${model}`)).toEqual({
        maxVoices: 2,
        maxTotalChars: 2500,
        streaming: model !== GEMINI_2_5,
      });
    }
    expect(
      getDialogueLimits(createGoogle({ apiKey: "k" })(GEMINI_3_8))
    ).toEqual({ maxVoices: 2, maxTotalChars: 2500, streaming: true });
  });

  it("returns undefined for models without native dialogue", () => {
    expect(getDialogueLimits("openai/tts-1")).toBeUndefined();
  });
});

describe("Google native dialogue limit", () => {
  const pcm = new Uint8Array(new Int16Array(2400).fill(6000).buffer);
  const audio = wrapPcmAsWav(pcm, 24_000);

  async function blocksFor(lengths: readonly number[]) {
    const model = createGoogle({ apiKey: "k" })(GEMINI_3_8);
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

  it("keeps a conversation at the limit in one native call", async () => {
    expect(await blocksFor([1250, 1250])).toBe(1);
  });

  it("splits a conversation one character over the limit into parallel blocks", async () => {
    expect(await blocksFor([1250, 1250, 1, 1])).toBe(2);
  });
});

describe("streamConversation limit", () => {
  it("throws a constraint error past maxTotalChars", async () => {
    const model = createGoogle({ apiKey: "k", fetch: vi.fn() })(GEMINI_3_8);
    const promise = streamConversation({
      model,
      turns: turnsOfChars([1250, 1250, 1]),
    });
    await expect(promise).rejects.toBeInstanceOf(DialogueConstraintError);
    await expect(promise).rejects.toThrow(AT_MOST_2500);
  });
});
