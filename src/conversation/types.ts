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
   * Equalize per-turn loudness in the stitched output by RMS-normalizing
   * each segment to match the loudest segment in the conversation. Quieter
   * providers (e.g. Hume Octave) are scaled up to match the loudest source
   * (e.g. ElevenLabs); the loudest source is never attenuated. Roughly two
   * O(N) passes over the PCM samples — cheap. Pass `false` to skip the
   * step entirely (~zero work). Stitch path only; native single-call
   * dialogue providers control their own mix. Default: true.
   */
  readonly normalizeVolume?: boolean;
  readonly providerOptions?: Record<string, unknown>;
  readonly turns: readonly ConversationTurn<V>[];
}
