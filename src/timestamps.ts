export type TimestampsSource = "native" | "aligned" | "estimated";

export interface WordTimestamp {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export interface ConversationWordTimestamp extends WordTimestamp {
  readonly turnIndex: number;
}

export interface TimedWordChunk {
  readonly durationSeconds: number;
  readonly words: readonly WordTimestamp[];
}

export function concatTimestampsWithOffsets(
  chunks: readonly TimedWordChunk[]
): WordTimestamp[] {
  const timestamps: WordTimestamp[] = [];
  let offsetSeconds = 0;
  for (const { durationSeconds, words } of chunks) {
    for (const word of words) {
      timestamps.push({
        text: word.text,
        start: word.start + offsetSeconds,
        end: word.end + offsetSeconds,
      });
    }
    offsetSeconds += durationSeconds;
  }
  return timestamps;
}
