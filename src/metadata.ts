import type { TimestampsSource } from "./timestamps.js";

/** What the spoken-tag check did. Present when tags reached the model, or whenever `spokenTagCheck` is passed. */
export interface SpokenTagReport {
  // True when a transcription ran; false when the text had no tags the model received, or the check failed.
  readonly checked: boolean;
  // Why the check was skipped or failed. The audio is then returned untouched.
  readonly failed?: string;
  readonly removedSeconds: number;
  // Number of spliced-out spans.
  readonly spans: number;
}

export interface SpeechMetadata {
  // For streaming, only set if the provider reports it.
  readonly audioDurationMs?: number;
  readonly chunks?: readonly {
    readonly index: number;
    readonly textStart: number;
    readonly textEnd: number;
    readonly audioDurationMs: number;
    readonly retryCount: number;
    readonly providerMetadata?: Record<string, unknown>;
    readonly spokenTags?: SpokenTagReport;
  }[];
  readonly inputChars: number;
  // For streaming, equals ttfbMs (we return as soon as the stream is ready).
  readonly latencyMs: number;
  readonly retryCount?: number;
  // Summed over chunks (and turns or dialogue blocks for conversations).
  readonly spokenTags?: SpokenTagReport;
  // How the returned word timestamps were produced. Set when timestamps are requested.
  readonly timestampsSource?: TimestampsSource;
  // Streaming only.
  readonly ttfbMs?: number;
}
