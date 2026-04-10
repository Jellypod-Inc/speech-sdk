export interface SpeechMetadata {
  /** Duration of the generated audio in milliseconds. Provider-reported; undefined if not available. */
  readonly audioDurationMs?: number;
  /** Number of characters in the input text (after audio tag processing). */
  readonly inputChars: number;
  /** Time from request start to full response received, in milliseconds. */
  readonly latencyMs: number;
  /** Model identifier (e.g. "tts-1", "eleven_multilingual_v2"). */
  readonly model: string;
  /** Provider identifier (e.g. "openai", "elevenlabs"). */
  readonly provider: string;
  /** Time from request start to first byte received, in milliseconds. Only set for streaming. */
  readonly ttfbMs?: number;
}
