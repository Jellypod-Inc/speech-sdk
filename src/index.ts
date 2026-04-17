// biome-ignore lint/performance/noBarrelFile: intentional public API barrel
export { detectAudioTags, stripAudioTags } from "./audio-tags.js";
export {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
export {
  ApiError,
  NoSpeechGeneratedError,
  SpeechSDKError,
  StreamingNotSupportedError,
} from "./errors.js";
export { generateConversation } from "./generate-conversation.js";
export { generateSpeech } from "./generate-speech.js";
export type { SpeechMetadata } from "./metadata.js";
export type {
  Feature,
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
  Voice,
} from "./speech-provider.js";
export {
  FEATURES,
  getFeature,
  hasFeature,
} from "./speech-provider.js";
export type { GeneratedAudioFile, SpeechResult } from "./speech-result.js";
export { streamSpeech } from "./stream-speech.js";
export type { StreamSpeechResult } from "./stream-speech-result.js";
export type { GenerateSpeechOptions } from "./types.js";
