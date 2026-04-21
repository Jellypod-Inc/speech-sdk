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
 * Controls whether `generateSpeech()` returns word timestamps.
 *
 * - `"auto"` (default): return timestamps only if the TTS provider supplies
 *   them natively. Free, no extra API calls.
 * - `"on"`: always return timestamps. Uses native data when available;
 *   otherwise falls back to a speech-to-text round-trip of the synthesized
 *   audio (cost + latency implications).
 * - `"off"`: never return timestamps, even when the provider would give them
 *   away for free.
 */
export type TimestampMode = "on" | "auto" | "off";
