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
  // Default true. Default target -20 dBFS (broadcast/podcast standard).
  readonly normalizeVolume?: boolean;
  readonly providerOptions?: Record<string, unknown>;
  // Defaults to OpenAI Whisper via OPENAI_API_KEY.
  readonly timestampProvider?: ResolvedSTTModel;
  readonly timestamps?: TimestampMode;
  readonly turns: readonly ConversationTurn<V>[];
  // dBFS, must be ≤ 0. Default -20.
  readonly volumeDbfs?: number;
}
