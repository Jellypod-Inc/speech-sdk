import type { WordTimestamp } from "../timestamps.js";
import type { Edit } from "./types.js";

function findEditAt(
  position: number,
  edits: readonly Edit[]
): Edit | undefined {
  return edits.find(
    (e) => position >= e.replacementRange[0] && position < e.replacementRange[1]
  );
}

function locateWordChar(
  substituted: string,
  searchFrom: number,
  word: string
): number {
  const haystack = substituted.toLowerCase();
  const needle = word.toLowerCase();
  return haystack.indexOf(needle, searchFrom);
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
  let pendingGroup: { edit: Edit; first: T; last: T } | null = null;

  const flushPending = () => {
    if (!pendingGroup) {
      return;
    }
    const merged = {
      ...pendingGroup.first,
      text: pendingGroup.edit.originalWord,
      start: pendingGroup.first.start,
      end: pendingGroup.last.end,
    } as T;
    out.push(merged);
    pendingGroup = null;
  };

  for (const ts of timestamps) {
    const pos = locateWordChar(substitutedText, cursor, ts.text);
    if (pos === -1) {
      flushPending();
      out.push(ts);
      continue;
    }
    cursor = pos + ts.text.length;
    const edit = findEditAt(pos, edits);

    if (edit) {
      if (pendingGroup && pendingGroup.edit === edit) {
        pendingGroup.last = ts;
      } else {
        flushPending();
        pendingGroup = { edit, first: ts, last: ts };
      }
    } else {
      flushPending();
      out.push(ts);
    }
  }

  flushPending();
  return out;
}
