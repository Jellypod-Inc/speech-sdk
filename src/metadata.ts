export interface SpeechMetadata {
  // For streaming, only set if the provider reports it.
  readonly audioDurationMs?: number;
  readonly inputChars: number;
  // For streaming, equals ttfbMs (we return as soon as the stream is ready).
  readonly latencyMs: number;
  readonly model: string;
  readonly provider: string;
  // Streaming only.
  readonly ttfbMs?: number;
}
