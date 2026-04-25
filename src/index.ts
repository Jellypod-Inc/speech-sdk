// biome-ignore lint/performance/noBarrelFile: public API entry point
export { timestampsToCaptions } from "./captions.js";
export {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export {
  ApiError,
  ConversationTimestampAttributionError,
  GatewayTimestampsUnavailableError,
  MissingApiKeyError,
  NoSpeechGeneratedError,
  SpeechSDKError,
  StreamingNotSupportedError,
  TimestampFallbackNotConfiguredError,
  TimestampKeyMissingError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
export { generateConversation } from "./generate-conversation.js";
export { generateSpeech } from "./generate-speech.js";
export { streamSpeech } from "./stream-speech.js";
