import type { AudioOutput } from "../audio-output.js";
import type { PronunciationsInput } from "../pronunciations/types.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import type { TimestampProvider } from "../timestamp-provider.js";
import type { TranscriptionProvider } from "../transcription-provider.js";

export interface ConversationTurn<V extends Voice = Voice> {
  /** Non-spoken delivery direction for this turn. */
  readonly instructions?: string;
  readonly model?: string | ResolvedModel<V>;
  readonly providerOptions?: Record<string, unknown>;
  // Time-stretch this turn's rendered audio. Range 0.75–1.5. Forces the stitch path. Stacks with top-level `speed`: turn-level applies first, then top-level applies to the merged audio.
  readonly speed?: number;
  /** The exact spoken transcript expected for this turn. */
  readonly text: string;
  readonly voice: V;
}

export interface GenerateConversationOptions<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> | undefined =
    | string
    | ResolvedModel<V>
    | undefined,
> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  readonly gapMs?: number;
  readonly headers?: Record<string, string>;
  /** Non-spoken delivery direction applied to the conversation. */
  readonly instructions?: string;
  readonly maxConcurrency?: number;
  readonly maxInputChars?: number;
  readonly maxRetries?: number;
  readonly model?: M;
  readonly output?: AudioOutput;
  readonly pronunciations?: PronunciationsInput;
  readonly providerOptions?: Record<string, unknown>;
  // Time-stretch the final audio. 1 = unchanged, <1 slower, >1 faster. Range 0.75–1.5. Mono only. Decodes → time-stretches → re-encodes (preserving `output` format if set, else WAV). Scales timestamps and audioDurationMs.
  readonly speed?: number;
  /**
   * Also return `turns`: one audio clip per input turn, cut at the silence after each turn's last word. Requires
   * `timestamps: true`. Throws `TurnSplitError` when turn boundaries can't be trusted.
   */
  readonly splitTurns?: boolean;
  // Transcribe each synthesized chunk (or native dialogue request) that carries audio tags and splice out any tag the voice read aloud, before stitching, alignment and turn splitting. Fails open.
  readonly spokenTagCheck?: TranscriptionProvider;
  readonly timestampProvider?: TimestampProvider;
  readonly timestamps?: boolean;
  readonly turns: readonly ConversationTurn<V>[];
  // dBFS, must be ≤ 0. Default -20 (broadcast/podcast standard).
  readonly volumeDbfs?: number;
}
