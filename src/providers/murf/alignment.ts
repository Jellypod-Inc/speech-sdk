import type { WordTimestamp } from "../../timestamps.js";

// Murf `/v1/speech/generate` `wordDurations` entry. Times are integer ms.
export interface MurfWordDuration {
  readonly endMs: number;
  readonly pitchScaleMaximum?: number;
  readonly pitchScaleMinimum?: number;
  readonly sourceWordIndex?: number;
  readonly startMs: number;
  readonly word: string;
}

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
