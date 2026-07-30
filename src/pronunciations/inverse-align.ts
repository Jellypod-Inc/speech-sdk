import { tokenizeTimestampSource } from "../timestamp-finalization.js";
import type { WordTimestamp } from "../timestamps.js";
import type { Edit } from "./types.js";

const LEXICAL_CHARACTER = /[\p{L}\p{N}]/u;

function findOverlappingEdit(
  start: number,
  end: number,
  edits: readonly Edit[]
): Edit | undefined {
  return edits.find(
    (edit) => start < edit.replacementRange[1] && end > edit.replacementRange[0]
  );
}

function findTokenStart(
  haystack: string,
  searchFrom: number,
  token: string
): number {
  return haystack.indexOf(token.toLowerCase(), searchFrom);
}

function findContainedEdits(
  start: number,
  end: number,
  edits: readonly Edit[]
): readonly Edit[] {
  return edits.filter(
    (edit) =>
      edit.replacementRange[0] >= start && edit.replacementRange[1] <= end
  );
}

function projectTextThroughEdits(
  substitutedText: string,
  start: number,
  end: number,
  edits: readonly Edit[]
): string {
  const parts: string[] = [];
  let cursor = start;

  for (const edit of edits) {
    parts.push(
      substitutedText.slice(cursor, edit.replacementRange[0]),
      edit.originalWord
    );
    cursor = edit.replacementRange[1];
  }

  parts.push(substitutedText.slice(cursor, end));
  return parts.join("");
}

function projectOriginalTokens<T extends WordTimestamp>(
  edit: Edit,
  alignedTimestamps: readonly [T, ...T[]],
  substitutedText: string,
  start: number,
  end: number
): T[] {
  const originalText = projectTextThroughEdits(substitutedText, start, end, [
    edit,
  ]);
  const sourceTokens = tokenizeTimestampSource(originalText);
  const firstTimestamp = alignedTimestamps[0];
  const lastTimestamp = alignedTimestamps.at(-1) ?? firstTimestamp;

  if (sourceTokens.length !== alignedTimestamps.length) {
    return [
      {
        ...firstTimestamp,
        text: originalText,
        start: firstTimestamp.start,
        end: lastTimestamp.end,
      },
    ];
  }

  return sourceTokens.map(({ text }, index) => ({
    ...alignedTimestamps[index],
    text,
  }));
}

export function inverseAlign<T extends WordTimestamp>(
  timestamps: readonly T[],
  substitutedText: string,
  edits: readonly Edit[]
): T[] {
  if (edits.length === 0) {
    return [...timestamps];
  }

  const out: T[] = [];
  let cursor = 0;
  let pendingGroup: {
    edit: Edit;
    end: number;
    start: number;
    timestamps: [T, ...T[]];
  } | null = null;
  const haystack = substitutedText.toLowerCase();

  const flushPending = () => {
    if (!pendingGroup) {
      return;
    }
    out.push(
      ...projectOriginalTokens(
        pendingGroup.edit,
        pendingGroup.timestamps,
        substitutedText,
        pendingGroup.start,
        pendingGroup.end
      )
    );
    pendingGroup = null;
  };

  for (const ts of timestamps) {
    const pos = findTokenStart(haystack, cursor, ts.text);
    if (pos === -1) {
      flushPending();
      out.push(ts);
      continue;
    }
    const end = pos + ts.text.length;
    cursor = end;
    const containedEdits = findContainedEdits(pos, end, edits);

    if (containedEdits.length > 0) {
      flushPending();
      out.push({
        ...ts,
        text: projectTextThroughEdits(
          substitutedText,
          pos,
          end,
          containedEdits
        ),
      });
      continue;
    }

    const lexicalOffset = ts.text.search(LEXICAL_CHARACTER);
    const lexicalStart = lexicalOffset === -1 ? pos : pos + lexicalOffset;
    const edit = findOverlappingEdit(lexicalStart, end, edits);

    if (edit) {
      if (pendingGroup && pendingGroup.edit === edit) {
        pendingGroup.timestamps.push(ts);
        pendingGroup.end = end;
      } else {
        flushPending();
        pendingGroup = { edit, end, start: pos, timestamps: [ts] };
      }
    } else {
      flushPending();
      out.push(ts);
    }
  }

  flushPending();
  return out;
}
