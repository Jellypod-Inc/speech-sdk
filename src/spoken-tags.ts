import type { DecodedPcm16 } from "./audio-decode.js";
import { detectAudioTags, textWithoutAudioTags } from "./audio-tags.js";
import { debug } from "./logger.js";
import type { SpokenTagReport } from "./metadata.js";
import type { ResolvedModel } from "./speech-provider.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import {
  canonicalizeTimestampText,
  tokenizeTimestampSource,
} from "./timestamp-finalization.js";
import type { TimestampProvider } from "./timestamp-provider.js";
import type { WordTimestamp } from "./timestamps.js";
import type { TranscriptionProvider } from "./transcription-provider.js";

// A lone tag word this short ("a", "in") is as likely a mishearing as a spoken tag, so it is only cut as part of a whole tag phrase.
const MIN_LONE_TAG_WORD_LENGTH = 4;
// Scribe ends a word early on its trailing consonant, so a cut with no neighbouring word keeps this much clear of the spoken edge.
const EDGE_PAD_SECONDS = 0.08;
// Long enough to hide the step a splice leaves, short enough to stay inside the silence the cut is placed in.
const SPLICE_FADE_SECONDS = 0.004;

const WORD = /[\p{L}\p{M}\p{N}'‘’]+/gu;

export interface AudioSpan {
  readonly endSeconds: number;
  readonly startSeconds: number;
}

interface Token {
  readonly skeleton: string;
  readonly word: number;
}

// Words compared as the timestamp validator compares them, apostrophes dropped; anything else non-alphanumeric separates.
function wordSkeletons(text: string): string[] {
  const skeletons: string[] = [];
  for (const match of text.matchAll(WORD)) {
    const skeleton = canonicalizeTimestampText(match[0]);
    if (skeleton) {
      skeletons.push(skeleton);
    }
  }
  return skeletons;
}

/** Each audio tag in the text as the words it would be heard as. */
export function tagPhrases(text: string): string[][] {
  return detectAudioTags(text)
    .map(wordSkeletons)
    .filter((phrase) => phrase.length > 0);
}

// Heard tokens the script accounts for, by longest common subsequence: heard token index to expected index.
function matchTokens(
  heard: readonly Token[],
  expected: readonly string[]
): Map<number, number> {
  const cols = expected.length + 1;
  const lengths = new Uint32Array((heard.length + 1) * cols);
  for (let i = heard.length - 1; i >= 0; i--) {
    for (let j = expected.length - 1; j >= 0; j--) {
      lengths[i * cols + j] =
        heard[i].skeleton === expected[j]
          ? lengths[(i + 1) * cols + j + 1] + 1
          : Math.max(lengths[(i + 1) * cols + j], lengths[i * cols + j + 1]);
    }
  }
  const matched = new Map<number, number>();
  let i = 0;
  let j = 0;
  while (i < heard.length && j < expected.length) {
    if (heard[i].skeleton === expected[j]) {
      matched.set(i, j);
      i++;
      j++;
    } else if (lengths[(i + 1) * cols + j] >= lengths[i * cols + j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return matched;
}

function isSpokenPhraseAt(
  tokens: readonly Token[],
  matched: ReadonlyMap<number, number>,
  phrase: readonly string[],
  at: number
): boolean {
  return phrase.every(
    (skeleton, k) =>
      !matched.has(at + k) && tokens[at + k]?.skeleton === skeleton
  );
}

// Unmatched heard tokens that spell a whole tag phrase, or a long enough single tag word.
function tagTokens(
  tokens: readonly Token[],
  matched: ReadonlyMap<number, number>,
  phrases: readonly (readonly string[])[]
): Set<number> {
  const loneTagWords = new Set(
    phrases
      .flat()
      .filter((skeleton) => skeleton.length >= MIN_LONE_TAG_WORD_LENGTH)
  );
  const cut = new Set<number>();
  for (let at = 0; at < tokens.length; at++) {
    if (matched.has(at)) {
      continue;
    }
    if (loneTagWords.has(tokens[at].skeleton)) {
      cut.add(at);
    }
    for (const phrase of phrases) {
      if (isSpokenPhraseAt(tokens, matched, phrase, at)) {
        for (let k = 0; k < phrase.length; k++) {
          cut.add(at + k);
        }
      }
    }
  }
  return cut;
}

// A heard word goes only when every token in it is cut, so a hyphenated script word is never half removed.
function tagWords(
  tokens: readonly Token[],
  cut: ReadonlySet<number>
): Set<number> {
  const words = new Set(tokens.filter((_, i) => cut.has(i)).map((t) => t.word));
  for (const [i, token] of tokens.entries()) {
    if (!cut.has(i)) {
      words.delete(token.word);
    }
  }
  return words;
}

// Each run of cut words as a span reaching midway into the silence either side, leaving one natural pause.
function spansOf(
  heard: readonly WordTimestamp[],
  cutWords: ReadonlySet<number>,
  duration: number
): AudioSpan[] {
  const spans: AudioSpan[] = [];
  let first = 0;
  while (first < heard.length) {
    if (!cutWords.has(first)) {
      first++;
      continue;
    }
    let last = first;
    while (cutWords.has(last + 1)) {
      last++;
    }
    const previous = heard[first - 1];
    const next = heard[last + 1];
    spans.push({
      startSeconds: previous
        ? (previous.end + heard[first].start) / 2
        : Math.max(0, heard[first].start - EDGE_PAD_SECONDS),
      endSeconds: next
        ? (heard[last].end + next.start) / 2
        : Math.min(duration, heard[last].end + EDGE_PAD_SECONDS),
    });
    first = last + 1;
  }
  return spans;
}

// Script word timings read off the heard words the alignment matched; undefined unless every script word was heard as itself.
function scriptTimings(args: {
  readonly expectedToken: readonly number[];
  readonly heard: readonly WordTimestamp[];
  readonly matches: ReadonlyMap<number, number>;
  readonly scriptTokens: readonly { readonly text: string }[];
  readonly tokens: readonly Token[];
}): WordTimestamp[] | undefined {
  const { expectedToken, heard, matches, scriptTokens, tokens } = args;
  const firstWord: number[] = [];
  const lastWord: number[] = [];
  const matchedCount = new Array<number>(scriptTokens.length).fill(0);
  for (const [heardIndex, expectedIndex] of matches) {
    const scriptIndex = expectedToken[expectedIndex];
    const word = tokens[heardIndex].word;
    firstWord[scriptIndex] ??= word;
    lastWord[scriptIndex] = word;
    matchedCount[scriptIndex]++;
  }
  const expectedCount = new Array<number>(scriptTokens.length).fill(0);
  for (const scriptIndex of expectedToken) {
    expectedCount[scriptIndex]++;
  }
  const timings: WordTimestamp[] = [];
  for (const [index, { text }] of scriptTokens.entries()) {
    const first = firstWord[index];
    const last = lastWord[index];
    // A heard word shared by two script words ("well known" heard as "well-known") has no boundary to split at.
    const sharesPreviousWord = index > 0 && first === lastWord[index - 1];
    if (
      first == null ||
      last == null ||
      matchedCount[index] !== expectedCount[index] ||
      sharesPreviousWord
    ) {
      return;
    }
    timings.push({ text, start: heard[first].start, end: heard[last].end });
  }
  return timings;
}

interface HeardAnalysis {
  // Timings for the script's words (tags removed) in the unspliced audio, when every word was heard as written.
  readonly scriptTimestamps?: readonly WordTimestamp[];
  readonly spans: readonly AudioSpan[];
}

function analyzeHeard(input: {
  readonly duration: number;
  readonly heard: readonly WordTimestamp[];
  readonly phrases: readonly (readonly string[])[];
  readonly text: string;
}): HeardAnalysis {
  const { heard, text, phrases, duration } = input;
  if (heard.length === 0) {
    return { spans: [] };
  }
  const tokens: Token[] = heard.flatMap((word, index) =>
    wordSkeletons(word.text).map((skeleton) => ({ skeleton, word: index }))
  );
  // Backchannel words (|mhm|) stay expected: a listener may voice them in the same audio.
  const scriptTokens = tokenizeTimestampSource(textWithoutAudioTags(text));
  const expected: string[] = [];
  const expectedToken: number[] = [];
  for (const [index, { text: tokenText }] of scriptTokens.entries()) {
    for (const skeleton of wordSkeletons(tokenText)) {
      expected.push(skeleton);
      expectedToken.push(index);
    }
  }
  const matches = matchTokens(tokens, expected);
  const cut = tagTokens(tokens, matches, phrases);
  return {
    scriptTimestamps: scriptTimings({
      expectedToken,
      heard,
      matches,
      scriptTokens,
      tokens,
    }),
    spans: spansOf(heard, tagWords(tokens, cut), duration),
  };
}

/**
 * Where the voice read a tag aloud: heard words the text does not account for that spell a tag. A script word
 * that equals a tag word is matched by the alignment and kept.
 */
export function spokenTagSpans(input: {
  readonly duration: number;
  readonly heard: readonly WordTimestamp[];
  readonly phrases: readonly (readonly string[])[];
  readonly text: string;
}): readonly AudioSpan[] {
  return input.phrases.length === 0 ? [] : analyzeHeard(input).spans;
}

function frameAt(seconds: number, sampleRate: number, frameCount: number) {
  return Math.min(Math.max(Math.round(seconds * sampleRate), 0), frameCount);
}

function fadePiece(
  piece: Int16Array,
  fadeFrames: number,
  fadeIn: boolean,
  fadeOut: boolean
): void {
  const fade = Math.min(fadeFrames, Math.floor(piece.length / 2));
  for (let frame = 0; frame < fade; frame++) {
    const gain = frame / fade;
    if (fadeIn) {
      piece[frame] = Math.round(piece[frame] * gain);
    }
    if (fadeOut) {
      const tail = piece.length - 1 - frame;
      piece[tail] = Math.round(piece[tail] * gain);
    }
  }
}

/** Mono PCM with the sorted, non-overlapping spans removed, each join faded out and back in so it cannot click. */
export function removePcm16Spans(
  pcm: Int16Array,
  sampleRate: number,
  spans: readonly AudioSpan[]
): Int16Array {
  const kept: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const span of spans) {
    const start = frameAt(span.startSeconds, sampleRate, pcm.length);
    if (start > cursor) {
      kept.push({ start: cursor, end: start });
    }
    cursor = Math.max(cursor, frameAt(span.endSeconds, sampleRate, pcm.length));
  }
  if (cursor < pcm.length) {
    kept.push({ start: cursor, end: pcm.length });
  }

  const fadeFrames = Math.max(1, Math.round(SPLICE_FADE_SECONDS * sampleRate));
  const out = new Int16Array(
    kept.reduce((total, piece) => total + piece.end - piece.start, 0)
  );
  let offset = 0;
  for (const [index, { start, end }] of kept.entries()) {
    const piece = pcm.slice(start, end);
    fadePiece(piece, fadeFrames, index > 0, index < kept.length - 1);
    out.set(piece, offset);
    offset += piece.length;
  }
  return out;
}

/** Where a moment of the original audio lands once the spans are removed; moments inside a span collapse to its start. */
function shiftTime(seconds: number, spans: readonly AudioSpan[]): number {
  let shifted = seconds;
  for (const span of spans) {
    shifted -= Math.max(
      0,
      Math.min(seconds, span.endSeconds) - span.startSeconds
    );
  }
  return shifted;
}

export function shiftTimestamps<T extends WordTimestamp>(
  timestamps: readonly T[] | undefined,
  spans: readonly AudioSpan[]
): T[] | undefined {
  return timestamps?.map((timestamp) => ({
    ...timestamp,
    start: shiftTime(timestamp.start, spans),
    end: shiftTime(timestamp.end, spans),
  }));
}

export const SPOKEN_TAGS_NOT_CHECKED: SpokenTagReport = {
  checked: false,
  removedSeconds: 0,
  spans: 0,
};

function spokenTagFailure(error: unknown): SpokenTagReport {
  const failed = error instanceof Error ? error.message : String(error);
  debug(`spoken tags: check failed, keeping audio (${failed}).`);
  return { ...SPOKEN_TAGS_NOT_CHECKED, failed };
}

export function noDecodableModeReport(
  modelIdentifier: string
): SpokenTagReport {
  return {
    ...SPOKEN_TAGS_NOT_CHECKED,
    failed: `${modelIdentifier} has no decodable PCM/WAV mode to splice.`,
  };
}

/** Whether the text a model receives carries any tag the voice could read aloud. */
export function hasCheckableTags(providerText: string): boolean {
  return tagPhrases(providerText).length > 0;
}

export async function pcm16ToWav(
  pcm: Int16Array,
  sampleRate: number
): Promise<Uint8Array> {
  // Lazy so callers that never check don't load the encoder.
  const { wrapPcm16Mono } = await import("./audio-utils.js");
  return await wrapPcm16Mono(
    new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    sampleRate
  );
}

interface SpokenTagCheckResult {
  readonly pcm: Int16Array;
  readonly report: SpokenTagReport;
  // Script word timings on the returned audio, read off the transcription when every word was heard as written.
  readonly scriptTimestamps?: readonly WordTimestamp[];
  readonly spans: readonly AudioSpan[];
}

/**
 * Transcribes the audio and splices out any tag the voice read aloud. `text` is what the model received, tags
 * included. Fails open: any error short of an abort returns the audio untouched with `failed` set.
 */
export async function checkSpokenTags(input: {
  readonly abortSignal?: AbortSignal;
  readonly pcm: Int16Array;
  readonly provider: TranscriptionProvider;
  readonly sampleRate: number;
  readonly text: string;
}): Promise<SpokenTagCheckResult> {
  const { pcm, sampleRate } = input;
  const phrases = tagPhrases(input.text);
  if (phrases.length === 0) {
    return { pcm, report: SPOKEN_TAGS_NOT_CHECKED, spans: [] };
  }
  try {
    const heard = await input.provider.transcribe({
      abortSignal: input.abortSignal,
      audio: await pcm16ToWav(pcm, sampleRate),
      mediaType: "audio/wav",
    });
    const { spans, scriptTimestamps } = analyzeHeard({
      duration: pcm.length / sampleRate,
      heard,
      phrases,
      text: input.text,
    });
    if (spans.length === 0) {
      return {
        pcm,
        report: { checked: true, removedSeconds: 0, spans: 0 },
        scriptTimestamps,
        spans,
      };
    }
    const spliced = removePcm16Spans(pcm, sampleRate, spans);
    const removedSeconds =
      Math.round(((pcm.length - spliced.length) / sampleRate) * 1000) / 1000;
    debug(
      `spoken tags: removed ${spans.length} span(s), ${removedSeconds}s of audio.`
    );
    return {
      pcm: spliced,
      report: { checked: true, removedSeconds, spans: spans.length },
      scriptTimestamps: shiftTimestamps(scriptTimestamps, spans),
      spans,
    };
  } catch (error) {
    if (input.abortSignal?.aborted) {
      throw error;
    }
    return { pcm, report: spokenTagFailure(error), spans: [] };
  }
}

/**
 * `checkSpokenTags` on encoded audio: decodes it first, failing open on a decode error too. `segment` is the
 * decoded (and possibly spliced) PCM, absent when the text had no tags or decoding failed.
 */
export async function checkSpokenTagsInAudio(input: {
  readonly abortSignal?: AbortSignal;
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly provider: TranscriptionProvider;
  readonly text: string;
}): Promise<{
  readonly report: SpokenTagReport;
  readonly scriptTimestamps?: readonly WordTimestamp[];
  readonly segment?: DecodedPcm16;
  readonly spans: readonly AudioSpan[];
}> {
  if (!hasCheckableTags(input.text)) {
    return { report: SPOKEN_TAGS_NOT_CHECKED, spans: [] };
  }
  let decoded: DecodedPcm16;
  try {
    const { decodeAudioToPcm16 } = await import("./audio-decode.js");
    decoded = await decodeAudioToPcm16(input.audio, input.mediaType);
  } catch (error) {
    return { report: spokenTagFailure(error), spans: [] };
  }
  const checked = await checkSpokenTags({
    abortSignal: input.abortSignal,
    pcm: decoded.pcm,
    provider: input.provider,
    sampleRate: decoded.sampleRate,
    text: input.text,
  });
  return {
    report: checked.report,
    scriptTimestamps: checked.scriptTimestamps,
    segment: { ...decoded, pcm: checked.pcm },
    spans: checked.spans,
  };
}

/** Sums several chunks' reports into one; undefined when none was reported. */
export function mergeSpokenTagReports(
  entries: readonly (SpokenTagReport | undefined)[]
): SpokenTagReport | undefined {
  const reports = entries.filter((r) => r != null);
  if (reports.length === 0) {
    return;
  }
  const failures = reports.flatMap((r) => (r.failed ? [r.failed] : []));
  const removed = reports.reduce((sum, r) => sum + r.removedSeconds, 0);
  return {
    checked: reports.some((r) => r.checked),
    removedSeconds: Math.round(removed * 1000) / 1000,
    spans: reports.reduce((sum, r) => sum + r.spans, 0),
    ...(failures.length > 0 && { failed: [...new Set(failures)].join("; ") }),
  };
}

/** How the SDK will hear a request's audio, or `false` when the caller turned the check off. */
export interface SpokenTagListener {
  readonly provider: TranscriptionProvider;
  // The listener is the same service the request would align timestamps with, so its word timings can stand in.
  readonly standsInForAligner: boolean;
}

function canTranscribe(value: unknown): value is TranscriptionProvider {
  return (
    typeof value === "object" &&
    value != null &&
    "transcribe" in value &&
    typeof value.transcribe === "function"
  );
}

function sttListener(stt: ResolvedSTTModel): TranscriptionProvider {
  return {
    transcribe: async ({ abortSignal, audio, mediaType }) =>
      (
        await stt.provider.transcribe({
          modelId: stt.modelId,
          audio,
          mediaType,
          abortSignal,
        })
      ).timestamps,
  };
}

/**
 * The first transcriber the request already has: an explicit `spokenTagCheck`, a `timestampProvider` that can
 * transcribe, the model's `fallbackSTT`, then the model's own speech-to-text. Never adds a vendor the caller did
 * not configure; undefined when there is none.
 */
export function resolveSpokenTagListener(args: {
  readonly option: TranscriptionProvider | false | undefined;
  readonly resolved: ResolvedModel;
  readonly timestampProvider?: TimestampProvider;
}): SpokenTagListener | false | undefined {
  const { option, resolved, timestampProvider } = args;
  if (option === false) {
    return false;
  }
  if (option) {
    return {
      provider: option,
      standsInForAligner:
        canTranscribe(timestampProvider) && option === timestampProvider,
    };
  }
  if (canTranscribe(timestampProvider)) {
    return { provider: timestampProvider, standsInForAligner: true };
  }
  if (resolved.fallbackSTT) {
    return {
      provider: sttListener(resolved.fallbackSTT),
      standsInForAligner: timestampProvider == null,
    };
  }
  if (resolved.transcription) {
    return { provider: resolved.transcription, standsInForAligner: false };
  }
  return;
}

export const NO_LISTENER_REPORT: SpokenTagReport = {
  ...SPOKEN_TAGS_NOT_CHECKED,
  failed:
    "no transcription provider: pass spokenTagCheck, or a timestampProvider that can transcribe.",
};
