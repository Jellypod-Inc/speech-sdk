import { z } from "zod";
import type { WordTimestamp } from "../../timestamps.js";

// Hume Octave-2 timestamp entry. time.begin/end are integer ms.
export const humeTimestampSchema = z.object({
  text: z.string(),
  time: z.object({ begin: z.number(), end: z.number() }),
  type: z.enum(["word", "phoneme"]),
});
export type HumeTimestamp = z.infer<typeof humeTimestampSchema>;

export const humeSnippetSchema = z.object({
  audio: z.string().optional(),
  id: z.string().optional(),
  text: z.string().optional(),
  timestamps: z.array(humeTimestampSchema).optional(),
});
export type HumeSnippet = z.infer<typeof humeSnippetSchema>;

// Assumes split_utterances: false so timestamps are relative to the full audio.
export function snippetsToWordTimestamps(
  snippets: readonly (readonly HumeSnippet[])[]
): WordTimestamp[] {
  const out: WordTimestamp[] = [];
  for (const utterance of snippets) {
    for (const segment of utterance) {
      const ts = segment.timestamps;
      if (!ts) {
        continue;
      }
      for (const entry of ts) {
        if (entry.type !== "word") {
          continue;
        }
        out.push({
          text: entry.text,
          start: entry.time.begin / 1000,
          end: entry.time.end / 1000,
        });
      }
    }
  }
  return out;
}
