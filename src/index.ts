// biome-ignore lint/performance/noBarrelFile: intentional public API barrel
export { detectAudioTags, stripAudioTags } from "./audio-tags.js";
export type { CaptionFormat, CaptionsOptions } from "./captions.js";
export { timestampsToCaptions } from "./captions.js";
export {
  ApiError,
  ConversationTimestampAttributionError,
  GatewayTimestampsUnavailableError,
  NoSpeechGeneratedError,
  SpeechSDKError,
  StreamingNotSupportedError,
  TimestampKeyMissingError,
} from "./errors.js";
export { generateSpeech } from "./generate-speech.js";
export type { SpeechMetadata } from "./metadata.js";
export type {
  Feature,
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
  TimestampsFeature,
  Voice,
} from "./speech-provider.js";
export {
  FEATURES,
  getFeature,
  hasFeature,
  isSpeechGatewayModel,
} from "./speech-provider.js";
export type {
  ConversationResult,
  GeneratedAudioFile,
  SpeechResult,
} from "./speech-result.js";
export type {
  ResolvedSTTModel,
  SpeechToTextProvider,
  STTModelInfo,
} from "./speech-to-text-provider.js";
export { streamSpeech } from "./stream-speech.js";
export type { StreamSpeechResult } from "./stream-speech-result.js";
export type {
  ConversationWordTimestamp,
  TimestampMode,
  WordTimestamp,
} from "./timestamps.js";
export type { GenerateSpeechOptions } from "./types.js";
