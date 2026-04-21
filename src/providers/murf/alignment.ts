import type { WordTimestamp } from "../../timestamps.js";

/**
 * Shape of a single entry in Murf's `wordDurations` array returned from
 * `/v1/speech/generate`. `startMs` / `endMs` are integer milliseconds from
 * the start of the audio. `word` is the spoken token (or the original input
 * token when `wordDurationsAsOriginalText: true` was requested).
 */
export interface MurfWordDuration {
  readonly endMs: number;
  readonly pitchScaleMaximum?: number;
  readonly pitchScaleMinimum?: number;
  readonly sourceWordIndex?: number;
  readonly startMs: number;
  readonly word: string;
}

/**
 * Converts Murf's word-level durations (milliseconds) into the SDK's
 * `WordTimestamp[]` (seconds). Murf already groups output by word, so no
 * aggregation is needed — this is just a unit conversion.
 */
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
