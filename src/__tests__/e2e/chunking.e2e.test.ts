import { describe, expect, it } from "vitest";
import { createOpenAI } from "../../providers/openai/index.js";
import { generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.OPENAI_API_KEY;

function longParagraph(sentenceCount: number): string {
  const sentences: string[] = [];
  for (let i = 0; i < sentenceCount; i++) {
    sentences.push(
      `Section ${i + 1} confirms that balanced chunking keeps long narration coherent across provider requests.`
    );
  }
  return sentences.join(" ");
}

describe.skipIf(!hasKey)("chunking e2e", () => {
  it("stitches a long direct-provider request split into multiple chunks", {
    timeout: 180_000,
  }, async () => {
    const text = longParagraph(28);
    const openai = createOpenAI();

    const result = await generateSpeech({
      model: openai("tts-1"),
      text,
      voice: "alloy",
      maxInputChars: 700,
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.metadata.inputChars).toBe(text.length);
    expect(result.metadata.audioDurationMs).toBeTypeOf("number");
  });

  it("converts stitched chunk output to mp3 when requested", {
    timeout: 120_000,
  }, async () => {
    const text = longParagraph(10);
    const openai = createOpenAI();

    const result = await generateSpeech({
      model: openai("tts-1"),
      text,
      voice: "alloy",
      maxInputChars: 400,
      output: { format: "mp3" },
    });

    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.metadata.inputChars).toBe(text.length);
  });
});
