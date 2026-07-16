import type { WordTimestamp } from "../timestamps.js";
import type { Edit } from "./types.js";

const LEXICAL_CHARACTER = /[\p{L}\p{N}]/u;

function findEditAt(
  position: number,
  edits: readonly Edit[]
): Edit | undefined {
  return edits.find(
    (e) => position >= e.replacementRange[0] && position < e.replacementRange[1]
  );
}

function findTokenStart(
  haystack: string,
  searchFrom: number,
  token: string
): number {
  return haystack.indexOf(token.toLowerCase(), searchFrom);
}

function findTokenLexicalStart(position: number, token: string): number {
  const offset = token.search(LEXICAL_CHARACTER);
  return offset === -1 ? position : position + offset;
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
  const haystack = substitutedText.toLowerCase();

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
    const pos = findTokenStart(haystack, cursor, ts.text);
    if (pos === -1) {
      flushPending();
      out.push(ts);
      continue;
    }
    cursor = pos + ts.text.length;
    const edit = findEditAt(findTokenLexicalStart(pos, ts.text), edits);

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
