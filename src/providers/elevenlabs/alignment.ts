import { z } from "zod";
import type { WordTimestamp } from "../../timestamps.js";

// ElevenLabs `/with-timestamps` `alignment` / `normalized_alignment`.
export const elevenLabsAlignmentSchema = z.object({
  character_end_times_seconds: z.array(z.number()),
  character_start_times_seconds: z.array(z.number()),
  characters: z.array(z.string()),
});
export type ElevenLabsAlignment = z.infer<typeof elevenLabsAlignmentSchema>;

const LEXICAL_CHAR = /[\p{L}\p{N}]/u;
const WHITESPACE_CHAR = /^\s$/;

interface AlignmentRun extends WordTimestamp {
  readonly separatorBefore: string;
}

function collectAlignmentRuns(alignment: ElevenLabsAlignment): AlignmentRun[] {
  const chars = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const runs: AlignmentRun[] = [];
  let text = "";
  let pendingSeparator = "";
  let separatorBefore = "";
  let runStart = 0;
  let runEnd = 0;
  let inRun = false;

  const flushRun = () => {
    if (!inRun) {
      return;
    }

    runs.push({ text, start: runStart, end: runEnd, separatorBefore });
    text = "";
    inRun = false;
  };

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const isWs = WHITESPACE_CHAR.test(c);

    if (isWs) {
      flushRun();
      pendingSeparator += c;
      continue;
    }

    const s = starts[i] ?? 0;
    const e = ends[i] ?? s;
    if (!inRun) {
      runStart = s;
      separatorBefore = pendingSeparator;
      pendingSeparator = "";
      inRun = true;
    }
    text += c;
    runEnd = e;
  }

  flushRun();

  return runs;
}

function mergeRuns(left: AlignmentRun, right: AlignmentRun): AlignmentRun {
  return {
    text: `${left.text}${right.separatorBefore}${right.text}`,
    start: left.start,
    end: right.end,
    separatorBefore: left.separatorBefore,
  };
}

// Prefer normalized_alignment for inputs with numbers/abbreviations — ElevenLabs expands those during synthesis.
export function alignmentToWordTimestamps(
  alignment: ElevenLabsAlignment
): WordTimestamp[] {
  const words: AlignmentRun[] = [];
  let leadingPunctuation: AlignmentRun | undefined;

  for (const run of collectAlignmentRuns(alignment)) {
    if (LEXICAL_CHAR.test(run.text)) {
      words.push(leadingPunctuation ? mergeRuns(leadingPunctuation, run) : run);
      leadingPunctuation = undefined;
      continue;
    }

    const previousIndex = words.length - 1;
    const previous = words[previousIndex];
    if (previous) {
      words[previousIndex] = mergeRuns(previous, run);
      continue;
    }

    leadingPunctuation = leadingPunctuation
      ? mergeRuns(leadingPunctuation, run)
      : run;
  }

  return words.map(({ text, start, end }) => ({ text, start, end }));
}
