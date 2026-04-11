export interface SpeechMetadata {
  /**
   * Duration of the generated audio in milliseconds.
   *
   * For `generateSpeech()`, this is computed from the audio bytes via
   * mediabunny, falling back to the provider-reported value if parsing
   * fails. For `streamSpeech()`, it is only the provider-reported value
   * (since the full audio isn't available until the stream is consumed),
   * and is undefined when the provider does not report it.
   */
  readonly audioDurationMs?: number;
  /** Number of characters in the input text (after audio tag processing). */
  readonly inputChars: number;
  /**
   * Time from request start to the response being ready, in milliseconds.
   *
   * For `generateSpeech()`, this is the full round-trip latency (request
   * sent → full response received). For `streamSpeech()`, the SDK returns
   * as soon as the stream response is ready, so this equals `ttfbMs`.
   */
  readonly latencyMs: number;
  /** Model identifier (e.g. "tts-1", "eleven_multilingual_v2"). */
  readonly model: string;
  /** Provider identifier (e.g. "openai", "elevenlabs"). */
  readonly provider: string;
  /** Time from request start to first byte received, in milliseconds. Only set for streaming. */
  readonly ttfbMs?: number;
}
