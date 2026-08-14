import { tokenizeTimestampSource } from "./timestamp-finalization.js";
import type { WordTimestamp } from "./timestamps.js";

export function estimateTimestamps(args: {
  readonly audioDurationMs: number | undefined;
  readonly text: string;
}): WordTimestamp[] | undefined {
  const tokens = tokenizeTimestampSource(args.text);
  if (tokens.length === 0) {
    return [];
  }
  if (
    args.audioDurationMs == null ||
    !Number.isFinite(args.audioDurationMs) ||
    args.audioDurationMs <= 0
  ) {
    return;
  }

  const wordSeconds = args.audioDurationMs / 1000 / tokens.length;
  return tokens.map((token, index) => ({
    text: token.text,
    start: index * wordSeconds,
    end: (index + 1) * wordSeconds,
  }));
}
