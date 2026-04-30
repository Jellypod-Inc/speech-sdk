import { SpeechSDKError } from "../errors.js";

export class DictionaryIdsRequireGatewayError extends SpeechSDKError {
  constructor() {
    super(
      "dictionaryIds require the gateway path. Use the gateway model string (e.g., 'openai/tts-1') or pass inline rules with { rules: [...] }."
    );
    this.name = "DictionaryIdsRequireGatewayError";
  }
}
