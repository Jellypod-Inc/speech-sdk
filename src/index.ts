export type { AudioOutput, AudioOutputFormat } from "./audio-output.js";
// biome-ignore lint/performance/noBarrelFile: public API entry point
export { timestampsToCaptions } from "./captions.js";
export {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export {
  ApiError,
  GatewayInputError,
  MissingApiKeyError,
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  SpeechSDKError,
  StreamingNotSupportedError,
  TimestampKeyMissingError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
export { generateConversation } from "./generate-conversation.js";
export { generateSpeech } from "./generate-speech.js";
export { streamSpeech } from "./stream-speech.js";
export { timestampsToTurns } from "./turns.js";
