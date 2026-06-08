export type { AudioOutput, AudioOutputFormat } from "./audio-output.js";
// biome-ignore lint/performance/noBarrelFile: public API entry point
export { timestampsToCaptions } from "./captions.js";
export {
  ConversationInputError,
  DialogueConstraintError,
  MixedDispatchError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export {
  ApiError,
  AudioOutputInputError,
  GatewayInputError,
  MissingApiKeyError,
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  SpeechSDKError,
  StreamingNotSupportedError,
  TextChunkingUnsupportedError,
  TimestampKeyMissingError,
  UnsupportedSampleRateError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
export { generateConversation } from "./generate-conversation.js";
export { generateSpeech } from "./generate-speech.js";
export type {
  Pronunciation,
  PronunciationsInput,
} from "./pronunciations/types.js";
export { streamSpeech } from "./stream-speech.js";
export { timestampsToTurns } from "./turns.js";
export type { GenerateSpeechOptions } from "./types.js";
