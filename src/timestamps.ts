/**
 * Word-granularity alignment data. Timestamps are always in seconds from
 * the start of the generated audio. Providers that natively return character
 * or phoneme granularity are aggregated to words internally.
 */
export interface WordTimestamp {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

/**
 * Word-granularity alignment data returned by `generateConversation()`.
 * Extends `WordTimestamp` with the index of the conversation turn the word
 * belongs to. On the stitch path the index is exact (each turn is rendered
 * separately). On the native dialogue path the index is derived by
 * text-matching the provider's word timestamps against the input turns; if
 * matching fails (e.g. the provider hallucinated, dropped, or reordered
 * words), `ConversationTimestampAttributionError` is thrown rather than
 * silently emitting wrong indices.
 */
export interface ConversationWordTimestamp extends WordTimestamp {
  /** Index into the `turns` array submitted to `generateConversation`. */
  readonly turnIndex: number;
}

/**
 * Controls whether `generateSpeech()` returns word timestamps.
 *
 * - `"off"` (default): never return timestamps.
 * - `"on"`: always return timestamps. Uses native alignment when the TTS
 *   provider supplies it; otherwise falls back to a speech-to-text round-trip
 *   of the synthesized audio (cost + latency implications). Through Speech
 *   Gateway the fallback runs server-side.
 */
export type TimestampMode = "on" | "off";
