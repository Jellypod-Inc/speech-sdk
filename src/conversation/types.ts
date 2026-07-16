import type { AudioOutput } from "../audio-output.js";
import type { PronunciationsInput } from "../pronunciations/types.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import type { TimestampProvider } from "../timestamp-provider.js";

export interface ConversationTurn<V extends Voice = Voice> {
  readonly model?: string | ResolvedModel<V>;
  readonly providerOptions?: Record<string, unknown>;
  // Time-stretch this turn's rendered audio. Range 0.75–1.5. Forces the stitch path. Stacks with top-level `speed`: turn-level applies first, then top-level applies to the merged audio.
  readonly speed?: number;
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
  readonly maxConcurrency?: number;
  readonly maxInputChars?: number;
  readonly maxRetries?: number;
  readonly model?: M;
  readonly output?: AudioOutput;
  readonly pronunciations?: PronunciationsInput;
  readonly providerOptions?: Record<string, unknown>;
  // Time-stretch the final audio. 1 = unchanged, <1 slower, >1 faster. Range 0.75–1.5. Mono only. Decodes → time-stretches → re-encodes (preserving `output` format if set, else WAV). Scales timestamps and audioDurationMs.
  readonly speed?: number;
  readonly timestampProvider?: TimestampProvider;
  readonly timestamps?: boolean;
  readonly turns: readonly ConversationTurn<V>[];
  // dBFS, must be ≤ 0. Default -20 (broadcast/podcast standard).
  readonly volumeDbfs?: number;
}
