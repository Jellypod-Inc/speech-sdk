import type { WordTimestamp } from "../../timestamps.js";

// Resemble `/synthesize` `audio_timestamps`. graph_chars/times are per-grapheme,
// times in seconds; phoneme arrays are typed but unused.
export interface ResembleAudioTimestamps {
  readonly graph_chars: readonly string[];
  readonly graph_times: readonly (readonly number[])[];
  readonly phon_chars?: readonly string[];
  readonly phon_times?: readonly (readonly number[])[];
}

const WHITESPACE_CHAR = /^\s$/;

// Whitespace flushes; punctuation stays attached to the adjacent word ("Hello,").
export function audioTimestampsToWordTimestamps(
  alignment: ResembleAudioTimestamps
): WordTimestamp[] {
  const chars = alignment.graph_chars;
  const times = alignment.graph_times;
  if (chars.length === 0) {
    return [];
  }

  const words: WordTimestamp[] = [];
  let buf = "";
  let wordStart = 0;
  let wordEnd = 0;
  let inWord = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? "";
    const isWs = WHITESPACE_CHAR.test(c);

    if (isWs) {
      if (inWord) {
        words.push({ text: buf, start: wordStart, end: wordEnd });
        buf = "";
        inWord = false;
      }
      continue;
    }

    const t = times[i];
    if (!t || t.length < 2) {
      continue;
    }
    const s = t[0];
    const e = t[1];
    if (!(Number.isFinite(s) && Number.isFinite(e))) {
      continue;
    }

    if (!inWord) {
      wordStart = s;
      inWord = true;
    }
    buf += c;
    wordEnd = e;
  }

  if (inWord && buf.length > 0) {
    words.push({ text: buf, start: wordStart, end: wordEnd });
  }

  return words;
}
