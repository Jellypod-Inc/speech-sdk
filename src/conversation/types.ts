import type { ResolvedModel, Voice } from "../speech-provider.js";

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
   * RMS-normalize each per-turn segment to an absolute target level
   * (-20 dBFS, the broadcast/podcast voice standard). Every call to
   * generateConversation produces output at the same loudness regardless
   * of which providers or content are used, so two separate conversations
   * can be played back-to-back without the listener adjusting volume.
   * Roughly two O(N) passes over the int16 PCM samples — cheap. Pass
   * `false` to skip the step entirely (~zero work) and keep the raw
   * provider levels. Stitch path only; native single-call dialogue
   * providers control their own mix. Default: true.
   */
  readonly normalizeVolume?: boolean;
  readonly providerOptions?: Record<string, unknown>;
  readonly turns: readonly ConversationTurn<V>[];
}
