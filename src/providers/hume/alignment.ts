import type { WordTimestamp } from "../../timestamps.js";

// Hume Octave-2 timestamp entry. time.begin/end are integer ms.
export interface HumeTimestamp {
  readonly text: string;
  readonly time: { readonly begin: number; readonly end: number };
  readonly type: "word" | "phoneme";
}

export interface HumeSnippet {
  readonly audio?: string;
  readonly id?: string;
  readonly text?: string;
  readonly timestamps?: readonly HumeTimestamp[];
}

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
