import type { TimestampsSource } from "./timestamps.js";

export interface SpeechMetadata {
  // For streaming, only set if the provider reports it.
  readonly audioDurationMs?: number;
  readonly inputChars: number;
  // For streaming, equals ttfbMs (we return as soon as the stream is ready).
  readonly latencyMs: number;
  // How the returned word timestamps were produced. Set on direct-provider paths when timestamps are requested; unset on the gateway path, where the gateway server owns the timestamp contract.
  readonly timestampsSource?: TimestampsSource;
  // Streaming only.
  readonly ttfbMs?: number;
}
