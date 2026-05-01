import type { AudioOutput } from "../audio-output.js";
import type { PronunciationsFor } from "../pronunciations/types.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";

export interface ConversationTurn<V extends Voice = Voice> {
  readonly model?: string | ResolvedModel<V>;
  readonly providerOptions?: Record<string, unknown>;
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
  readonly maxRetries?: number;
  readonly model?: M;
  readonly output?: AudioOutput;
  readonly pronunciations?: PronunciationsFor<M>;
  readonly providerOptions?: Record<string, unknown>;
  readonly timestamps?: boolean;
  readonly turns: readonly ConversationTurn<V>[];
  // dBFS, must be ≤ 0. Default -20 (broadcast/podcast standard).
  readonly volumeDbfs?: number;
}
