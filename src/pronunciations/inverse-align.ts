import { tokenizeTimestampSource } from "../timestamp-finalization.js";
import type { WordTimestamp } from "../timestamps.js";
import type { Edit } from "./types.js";

const LEXICAL_CHARACTER = /[\p{L}\p{N}]/u;

export const PRONUNCIATION_TIMESTAMP_ESTIMATE_WARNING =
  "speech-sdk: pronunciation projection estimated one or more word boundaries.";

export interface InverseAlignmentResult<T extends WordTimestamp> {
  readonly estimatedBoundaries: boolean;
  readonly timestamps: readonly T[];
}

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

function timestampCanonical(timestamp: WordTimestamp): string {
  return tokenizeTimestampSource(timestamp.text)
    .map((token) => token.canonical)
    .join("");
}

type SourceToken = ReturnType<typeof tokenizeTimestampSource>[number];

function findExactAnchorLengths(
  sourceTokens: readonly SourceToken[],
  alignedTimestamps: readonly WordTimestamp[]
): { prefixLength: number; suffixLength: number } {
  const replacementCanonical = alignedTimestamps.map(timestampCanonical);
  let prefixLength = 0;
  while (
    prefixLength < sourceTokens.length &&
    prefixLength < replacementCanonical.length &&
    sourceTokens[prefixLength]?.canonical === replacementCanonical[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < sourceTokens.length - prefixLength &&
    suffixLength < replacementCanonical.length - prefixLength &&
    sourceTokens.at(-(suffixLength + 1))?.canonical ===
      replacementCanonical.at(-(suffixLength + 1))
  ) {
    suffixLength += 1;
  }

  const unmatchedReplacementCount =
    alignedTimestamps.length - prefixLength - suffixLength;
  if (
    sourceTokens.length === prefixLength + suffixLength &&
    unmatchedReplacementCount > 0
  ) {
    // An insertion needs an adjacent source token to own its elapsed time.
    if (suffixLength > 0) {
      suffixLength -= 1;
    } else {
      prefixLength -= 1;
    }
  }

  return { prefixLength, suffixLength };
}

function projectOneToOne<T extends WordTimestamp>(
  sourceTokens: readonly SourceToken[],
  alignedTimestamps: readonly T[]
): T[] {
  const projected: T[] = [];
  for (const [index, sourceToken] of sourceTokens.entries()) {
    const timestamp = alignedTimestamps[index];
    if (timestamp) {
      projected.push({ ...timestamp, text: sourceToken.text });
    }
  }
  return projected;
}

function projectChangedTokens<T extends WordTimestamp>(args: {
  alignedTimestamps: readonly [T, ...T[]];
  prefixLength: number;
  replacementMiddle: readonly T[];
  sourceMiddle: readonly SourceToken[];
  suffixLength: number;
}): InverseAlignmentResult<T> {
  const {
    alignedTimestamps,
    prefixLength,
    replacementMiddle,
    sourceMiddle,
    suffixLength,
  } = args;
  if (
    sourceMiddle.length === replacementMiddle.length &&
    replacementMiddle.length > 0
  ) {
    return {
      estimatedBoundaries: false,
      timestamps: projectOneToOne(sourceMiddle, replacementMiddle),
    };
  }

  if (replacementMiddle.length > 0) {
    const first = replacementMiddle[0] ?? alignedTimestamps[0];
    const last = replacementMiddle.at(-1) ?? first;
    if (sourceMiddle.length === 1) {
      return {
        estimatedBoundaries: false,
        timestamps: [
          {
            ...first,
            text: sourceMiddle[0]?.text ?? first.text,
            start: first.start,
            end: last.end,
          },
        ],
      };
    }

    const duration = Math.max(0, last.end - first.start);
    return {
      estimatedBoundaries: sourceMiddle.length > 1,
      timestamps: sourceMiddle.map((sourceToken, index) => ({
        ...first,
        text: sourceToken.text,
        start: first.start + (duration * index) / sourceMiddle.length,
        end:
          index === sourceMiddle.length - 1
            ? last.end
            : first.start + (duration * (index + 1)) / sourceMiddle.length,
      })),
    };
  }

  if (sourceMiddle.length === 0) {
    return { estimatedBoundaries: false, timestamps: [] };
  }

  const previous =
    prefixLength > 0 ? alignedTimestamps[prefixLength - 1] : undefined;
  const next =
    suffixLength > 0 ? alignedTimestamps.at(-suffixLength) : undefined;
  const template = previous ?? next ?? alignedTimestamps[0];
  const boundary = previous?.end ?? next?.start ?? template.start;
  return {
    estimatedBoundaries: true,
    timestamps: sourceMiddle.map((sourceToken) => ({
      ...template,
      text: sourceToken.text,
      start: boundary,
      end: boundary,
    })),
  };
}

function projectOriginalTokens<T extends WordTimestamp>(
  originalText: string,
  alignedTimestamps: readonly [T, ...T[]]
): InverseAlignmentResult<T> {
  const sourceTokens = tokenizeTimestampSource(originalText);
  const firstTimestamp = alignedTimestamps[0];
  const lastTimestamp = alignedTimestamps.at(-1) ?? firstTimestamp;

  if (sourceTokens.length === 0) {
    return {
      estimatedBoundaries: false,
      timestamps: [
        {
          ...firstTimestamp,
          text: originalText,
          start: firstTimestamp.start,
          end: lastTimestamp.end,
        },
      ],
    };
  }

  const { prefixLength, suffixLength } = findExactAnchorLengths(
    sourceTokens,
    alignedTimestamps
  );
  const prefix = projectOneToOne(
    sourceTokens.slice(0, prefixLength),
    alignedTimestamps.slice(0, prefixLength)
  );

  const sourceMiddle = sourceTokens.slice(
    prefixLength,
    sourceTokens.length - suffixLength
  );
  const replacementMiddle = alignedTimestamps.slice(
    prefixLength,
    alignedTimestamps.length - suffixLength
  );
  const middle = projectChangedTokens({
    alignedTimestamps,
    prefixLength,
    replacementMiddle,
    sourceMiddle,
    suffixLength,
  });
  const suffix = projectOneToOne(
    sourceTokens.slice(sourceTokens.length - suffixLength),
    alignedTimestamps.slice(alignedTimestamps.length - suffixLength)
  );

  return {
    estimatedBoundaries: middle.estimatedBoundaries,
    timestamps: [...prefix, ...middle.timestamps, ...suffix],
  };
}

export function inverseAlignWithQuality<T extends WordTimestamp>(
  timestamps: readonly T[],
  substitutedText: string,
  edits: readonly Edit[]
): InverseAlignmentResult<T> {
  if (edits.length === 0) {
    return { estimatedBoundaries: false, timestamps: [...timestamps] };
  }

  const out: T[] = [];
  let estimatedBoundaries = false;
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
    const originalText = projectTextThroughEdits(
      substitutedText,
      pendingGroup.start,
      pendingGroup.end,
      [pendingGroup.edit]
    );
    const projected = projectOriginalTokens(
      originalText,
      pendingGroup.timestamps
    );
    out.push(...projected.timestamps);
    estimatedBoundaries ||= projected.estimatedBoundaries;
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
      const originalText = projectTextThroughEdits(
        substitutedText,
        pos,
        end,
        containedEdits
      );
      const projected = projectOriginalTokens(originalText, [ts]);
      out.push(...projected.timestamps);
      estimatedBoundaries ||= projected.estimatedBoundaries;
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
  return { estimatedBoundaries, timestamps: out };
}

export function inverseAlign<T extends WordTimestamp>(
  timestamps: readonly T[],
  substitutedText: string,
  edits: readonly Edit[]
): T[] {
  return [
    ...inverseAlignWithQuality(timestamps, substitutedText, edits).timestamps,
  ];
}
