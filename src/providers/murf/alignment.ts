import { z } from "zod";
import type { WordTimestamp } from "../../timestamps.js";

// Murf `/v1/speech/generate` `wordDurations` entry. Times are integer ms.
export const murfWordDurationSchema = z.object({
  endMs: z.number(),
  pitchScaleMaximum: z.number().optional(),
  pitchScaleMinimum: z.number().optional(),
  sourceWordIndex: z.number().optional(),
  startMs: z.number(),
  word: z.string(),
});
export type MurfWordDuration = z.infer<typeof murfWordDurationSchema>;

export function wordDurationsToWordTimestamps(
  durations: readonly MurfWordDuration[]
): WordTimestamp[] {
  const out: WordTimestamp[] = [];
  for (const d of durations) {
    out.push({
      text: d.word,
      start: d.startMs / 1000,
      end: d.endMs / 1000,
    });
  }
  return out;
}
