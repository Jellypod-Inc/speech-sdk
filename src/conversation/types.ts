import type { ResolvedModel, Voice } from "../speech-provider.js";
import type { ResolvedSTTModel } from "../speech-to-text-provider.js";
import type { TimestampMode } from "../timestamps.js";

export interface ConversationTurn<V extends Voice = Voice> {
  readonly model?: string | ResolvedModel<V>;
  readonly providerOptions?: Record<string, unknown>;
  readonly text: string;
  readonly voice: V;
}

export interface GenerateConversationOptions<V extends Voice = Voice> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  readonly gapMs?: number;
  readonly headers?: Record<string, string>;
  readonly maxConcurrency?: number;
  readonly maxRetries?: number;
  readonly model?: string | ResolvedModel<V>;
  /**
   * RMS-normalize the output audio to an absolute target level (see
   * `volumeDbfs` for the level itself, default -20 dBFS — the broadcast /
   * podcast voice standard). Every call to generateConversation produces
   * output at the same loudness regardless of which providers or content
   * are used, so two separate conversations can be played back-to-back
   * without the listener adjusting volume. Roughly two O(N) passes over
   * the int16 PCM samples — cheap. Pass `false` to skip the step entirely
   * (~zero work) and keep the raw provider levels. Applied on both the
   * stitch and native dialogue paths, provided the chosen provider
   * exposes a decodable PCM/WAV mode via `getStitchOptions`. Default: true.
   */
  readonly normalizeVolume?: boolean;
  readonly providerOptions?: Record<string, unknown>;
  /**
   * Override the STT provider used for the derived-timestamps path. Construct
   * via a factory (e.g. `createOpenAISTT({ apiKey })("whisper-1")`). Only
   * consulted when the TTS provider can't supply timestamps natively. Defaults
   * to OpenAI Whisper read from `OPENAI_API_KEY`.
   */
  readonly timestampProvider?: ResolvedSTTModel;
  /**
   * Controls whether the returned `SpeechResult` includes word-level
   * timestamps. Default `"auto"`. On the stitch path each turn's timestamps
   * are offset by cumulative duration + gap and concatenated flat; on the
   * native path the mixed audio yields a flat list without speaker labels.
   */
  readonly timestamps?: TimestampMode;
  readonly turns: readonly ConversationTurn<V>[];
  /**
   * Target loudness in dBFS for `normalizeVolume`. Must be ≤ 0 (0 dBFS is
   * the int16 ceiling). Lower values are quieter — -20 leaves ~20 dB of
   * peak headroom so typical TTS speech doesn't clip after gain. Ignored
   * when `normalizeVolume` is `false`. Default: -20.
   */
  readonly volumeDbfs?: number;
}
