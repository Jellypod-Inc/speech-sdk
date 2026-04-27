import { z } from "zod";
import type { WordTimestamp } from "../../timestamps.js";

// ElevenLabs `/with-timestamps` `alignment` / `normalized_alignment`.
export const elevenLabsAlignmentSchema = z.object({
  character_end_times_seconds: z.array(z.number()),
  character_start_times_seconds: z.array(z.number()),
  characters: z.array(z.string()),
});
export type ElevenLabsAlignment = z.infer<typeof elevenLabsAlignmentSchema>;

const WHITESPACE_CHAR = /^\s$/;

// Prefer normalized_alignment for inputs with numbers/abbreviations — ElevenLabs expands those during synthesis.
export function alignmentToWordTimestamps(
  alignment: ElevenLabsAlignment
): WordTimestamp[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;

  if (chars.length === 0) {
    return [];
  }

  const words: WordTimestamp[] = [];
  let buf = "";
  let wordStart = 0;
  let wordEnd = 0;
  let inWord = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const isWs = WHITESPACE_CHAR.test(c);

    if (isWs) {
      if (inWord) {
        words.push({ text: buf, start: wordStart, end: wordEnd });
        buf = "";
        inWord = false;
      }
      continue;
    }

    const s = starts[i] ?? 0;
    const e = ends[i] ?? s;
    if (!inWord) {
      wordStart = s;
      inWord = true;
    }
    buf += c;
    wordEnd = e;
  }

  if (inWord && buf.length > 0) {
    words.push({ text: buf, start: wordStart, end: wordEnd });
  }

  return words;
}
