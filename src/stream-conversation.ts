import pRetry from "p-retry";
import {
  ConversationInputError,
  DialogueConstraintError,
} from "./conversation/errors.js";
import {
  NoSpeechGeneratedError,
  StreamingNotSupportedError,
} from "./errors.js";
import { buildSubstitutedTurns } from "./generate-conversation.js";
import {
  combineInstructions,
  nonEmptyInstructions,
  validateInstructionSupport,
} from "./instructions.js";
import type { SpeechMetadata } from "./metadata.js";
import { mergeRules } from "./pronunciations/merge.js";
import type { PronunciationsInput } from "./pronunciations/types.js";
import { resolveModel } from "./resolve-provider.js";
import { buildRetryOptions } from "./retry-options.js";
import type { ResolvedModel, Voice } from "./speech-provider.js";
import type { StreamSpeechResult } from "./stream-speech-result.js";

export interface StreamConversationTurn<V extends Voice = Voice> {
  /** Non-spoken delivery direction for this turn. */
  readonly instructions?: string;
  /** The exact spoken transcript expected for this turn. */
  readonly text: string;
  readonly voice: V;
}

export interface StreamConversationOptions<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  readonly headers?: Record<string, string>;
  /** Non-spoken delivery direction applied to the conversation. */
  readonly instructions?: string;
  readonly maxRetries?: number;
  readonly model: M;
  readonly pronunciations?: PronunciationsInput;
  readonly providerOptions?: Record<string, unknown>;
  readonly turns: readonly StreamConversationTurn<V>[];
}

// generateConversation options that need the whole take; a JS caller passing them gets an error, not silence.
const BUFFERED_ONLY_OPTIONS = [
  "gapMs",
  "maxConcurrency",
  "maxInputChars",
  "output",
  "speed",
  "splitTurns",
  "spokenTagCheck",
  "timestampProvider",
  "timestamps",
  "volumeDbfs",
] as const;
const BUFFERED_ONLY_TURN_OPTIONS = [
  "model",
  "providerOptions",
  "speed",
] as const;

function rejectBufferedOnlyOptions(options: object): void {
  for (const name of BUFFERED_ONLY_OPTIONS) {
    if (name in options && Reflect.get(options, name) !== undefined) {
      throw new ConversationInputError(
        `streamConversation does not support ${name}; use generateConversation.`
      );
    }
  }
  const turns: readonly object[] = Reflect.get(options, "turns") ?? [];
  for (const [index, turn] of turns.entries()) {
    for (const name of BUFFERED_ONLY_TURN_OPTIONS) {
      if (name in turn && Reflect.get(turn, name) !== undefined) {
        throw new ConversationInputError(
          `streamConversation does not support turns[${index}].${name}; set it at the top level or use generateConversation.`
        );
      }
    }
  }
}

// The provider's streamDialogue, once the turns fit its native dialogue limits.
function streamableDialogue<V extends Voice>(
  resolved: ResolvedModel<V>,
  turns: readonly StreamConversationTurn<V>[]
): NonNullable<ResolvedModel<V>["provider"]["streamDialogue"]> {
  const { provider, modelId } = resolved;
  const caps = provider.dialogueCapabilities?.(modelId);
  if (!(provider.streamDialogue && caps?.streaming)) {
    throw new StreamingNotSupportedError(
      `${provider.id}/${modelId} dialogue`,
      "generateConversation()"
    );
  }
  const constraint = (rule: string, observed: string) =>
    new DialogueConstraintError({
      provider: provider.id,
      model: modelId,
      rule,
      observed,
    });
  const voices = new Set(turns.map((turn) => turn.voice));
  if (voices.size < 2 || voices.size > caps.maxVoices) {
    throw constraint(
      `2 to ${caps.maxVoices} distinct voices`,
      `${voices.size}`
    );
  }
  if (
    provider.acceptsDialogueVoices?.(
      modelId,
      turns.map((turn) => turn.voice)
    ) === false
  ) {
    throw constraint("prebuilt voices", "a custom voice");
  }
  const totalChars = turns.reduce((n, turn) => n + turn.text.length, 0);
  if (caps.maxTotalChars != null && totalChars > caps.maxTotalChars) {
    throw constraint(
      `at most ${caps.maxTotalChars} characters when streamed (use generateConversation for longer conversations)`,
      `${totalChars}`
    );
  }
  return provider.streamDialogue.bind(provider);
}

/**
 * Stream native multi-speaker dialogue: audio starts arriving before the whole take is generated. One provider
 * request, so the conversation must fit the model's native dialogue limits. Throws `StreamingNotSupportedError` for
 * models that can't stream dialogue; it never falls back to buffered audio.
 */
export async function streamConversation<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
>(options: StreamConversationOptions<V, M>): Promise<StreamSpeechResult> {
  const { abortSignal, headers } = options;
  if (options.turns.length === 0) {
    throw new ConversationInputError(
      "streamConversation requires at least one turn."
    );
  }
  for (const [index, turn] of options.turns.entries()) {
    if (turn.text.trim().length === 0) {
      throw new ConversationInputError(
        `turns[${index}].text must not be empty.`
      );
    }
  }
  rejectBufferedOnlyOptions(options);

  const resolved = resolveModel(options.model, {
    apiKey: options.apiKey,
  }) as ResolvedModel<V>;
  const streamDialogue = streamableDialogue(resolved, options.turns);
  for (const turn of options.turns) {
    validateInstructionSupport(
      resolved,
      combineInstructions(options.instructions, turn.instructions)
    );
  }

  const ruleMap = options.pronunciations?.rules?.length
    ? mergeRules(options.pronunciations.rules)
    : null;
  const prepared = buildSubstitutedTurns(options.turns, resolved, ruleMap);
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;
  for (const [index, turn] of prepared.entries()) {
    if (turn.text.trim().length === 0) {
      throw new NoSpeechGeneratedError(
        `turns[${index}] is empty after removing unsupported audio tags for ${modelIdentifier}.`,
        {
          model: resolved.modelId,
          provider: resolved.provider.id,
          reason: "empty_input",
        }
      );
    }
  }

  const instructions = nonEmptyInstructions(options.instructions);

  const startTime = performance.now();
  const result = await pRetry(
    () =>
      streamDialogue({
        modelId: resolved.modelId,
        turns: prepared.map((turn) => ({
          voice: turn.voice,
          text: turn.text,
          ...(turn.instructions && { instructions: turn.instructions }),
        })),
        ...(instructions && { instructions }),
        providerOptions: options.providerOptions,
        abortSignal,
        headers,
      }),
    buildRetryOptions({ maxRetries: options.maxRetries ?? 2, abortSignal })
  );
  const ttfbMs = Math.round(performance.now() - startTime);

  const metadata: SpeechMetadata = {
    latencyMs: ttfbMs,
    ttfbMs,
    inputChars: options.turns.reduce((n, turn) => n + turn.text.length, 0),
  };
  const warnings = prepared.flatMap((turn) => turn.warnings);

  return {
    audio: result.stream,
    mediaType: result.mediaType,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}
