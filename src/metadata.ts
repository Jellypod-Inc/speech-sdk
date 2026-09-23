import type { TimestampsSource } from "./timestamps.js";

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
  }[];
  readonly inputChars: number;
  // For streaming, equals ttfbMs (we return as soon as the stream is ready).
  readonly latencyMs: number;
  readonly retryCount?: number;
  // How the returned word timestamps were produced. Set when timestamps are requested.
  readonly timestampsSource?: TimestampsSource;
  // Streaming only.
  readonly ttfbMs?: number;
}
