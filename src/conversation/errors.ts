import { SpeechSDKError } from "../errors.js";

export class ConversationInputError extends SpeechSDKError {
  constructor(message: string) {
    super(message);
    this.name = "ConversationInputError";
  }
}

export class DialogueConstraintError extends SpeechSDKError {
  readonly provider: string;
  readonly model: string;

  constructor(options: {
    provider: string;
    model: string;
    rule: string;
    observed: string;
  }) {
    super(
      `${options.provider}/${options.model} native dialogue requires ${options.rule}; got ${options.observed}.`
    );
    this.name = "DialogueConstraintError";
    this.provider = options.provider;
    this.model = options.model;
  }
}

export class StitchUnsupportedError extends SpeechSDKError {
  readonly provider: string;
  readonly model: string;

  constructor(options: { provider: string; model: string }) {
    super(
      `${options.provider}/${options.model} cannot be used in a stitched conversation: provider does not support PCM/WAV output for this model.`
    );
    this.name = "StitchUnsupportedError";
    this.provider = options.provider;
    this.model = options.model;
  }
}

export type TurnSplitFailureReason =
  | "empty_turn"
  | "non_monotonic"
  | "proportional_attribution"
  | "undecodable_audio";

const TURN_SPLIT_MESSAGES: Record<TurnSplitFailureReason, string> = {
  empty_turn: "a turn has no attributed words",
  non_monotonic: "word timings run backwards across a turn boundary",
  proportional_attribution:
    "words were attributed to turns proportionally, so turn boundaries are approximate",
  undecodable_audio: "the conversation audio is not decodable PCM/WAV",
};

export class TurnSplitError extends SpeechSDKError {
  readonly reason: TurnSplitFailureReason;
  readonly turnIndex?: number;

  constructor(options: { reason: TurnSplitFailureReason; turnIndex?: number }) {
    const where =
      options.turnIndex == null ? "" : ` (turn ${options.turnIndex})`;
    super(
      `generateConversation cannot split per-turn audio: ${TURN_SPLIT_MESSAGES[options.reason]}${where}.`
    );
    this.name = "TurnSplitError";
    this.reason = options.reason;
    if (options.turnIndex != null) {
      this.turnIndex = options.turnIndex;
    }
  }
}
