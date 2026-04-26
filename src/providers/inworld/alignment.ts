import { z } from "zod";
import type { WordTimestamp } from "../../timestamps.js";

// Inworld `timestampInfo.wordAlignment` (timestamp_type: "WORD"). Times in seconds.
export const inworldWordAlignmentSchema = z.object({
  phoneticDetails: z.array(z.unknown()).optional(),
  wordEndTimeSeconds: z.array(z.number()),
  wordStartTimeSeconds: z.array(z.number()),
  words: z.array(z.string()),
});
export type InworldWordAlignment = z.infer<typeof inworldWordAlignmentSchema>;

export function wordAlignmentToWordTimestamps(
  alignment: InworldWordAlignment
): WordTimestamp[] {
  const len = Math.min(
    alignment.words.length,
    alignment.wordStartTimeSeconds.length,
    alignment.wordEndTimeSeconds.length
  );
  const out: WordTimestamp[] = [];
  for (let i = 0; i < len; i++) {
    const text = alignment.words[i];
    const start = alignment.wordStartTimeSeconds[i];
    const end = alignment.wordEndTimeSeconds[i];
    // Drop empty-string entries (Inworld emits them for silence/punctuation).
    if (text == null || start == null || end == null || text.length === 0) {
      continue;
    }
    out.push({ text, start, end });
  }
  return out;
}
