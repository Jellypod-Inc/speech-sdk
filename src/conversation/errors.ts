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

export class MixedDispatchError extends SpeechSDKError {
  constructor() {
    super(
      'generateConversation: cannot mix gateway-routed models (e.g. "openai/tts-1") with direct-provider models in a single conversation. All turns must route through the gateway, or all turns must use direct providers.'
    );
    this.name = "MixedDispatchError";
  }
}
