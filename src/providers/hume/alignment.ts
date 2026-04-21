import type { WordTimestamp } from "../../timestamps.js";

/**
 * Shape of one timestamp entry inside a Hume Octave-2 `snippets[][].timestamps`
 * array. `time.begin` and `time.end` are integer milliseconds from the start
 * of that snippet's audio. Hume emits both `"word"` and `"phoneme"` entries
 * when both are requested via `include_timestamp_types`.
 */
export interface HumeTimestamp {
  readonly text: string;
  readonly time: { readonly begin: number; readonly end: number };
  readonly type: "word" | "phoneme";
}

/**
 * Shape of a single Hume Octave snippet (one segment of one utterance). When
 * the SDK asks for timestamps it sets `split_utterances: false`, so each
 * utterance produces exactly one snippet whose audio matches the top-level
 * `generations[0].audio` byte-for-byte — meaning the timestamps inside are
 * already relative to the full returned audio.
 */
export interface HumeSnippet {
  readonly audio?: string;
  readonly id?: string;
  readonly text?: string;
  readonly timestamps?: readonly HumeTimestamp[];
}

/**
 * Flatten the nested `snippets[utterance][segment].timestamps` arrays from a
 * Hume `/v0/tts` response into a single word-level alignment array, filtering
 * to `type: "word"` entries and converting milliseconds to seconds.
 *
 * Assumes the caller set `split_utterances: false` (and a single utterance),
 * so segment-relative offsets don't need to be re-based against the full audio.
 */
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
