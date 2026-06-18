export type { AudioOutput, AudioOutputFormat } from "./audio-output.js";
// biome-ignore lint/performance/noBarrelFile: public API entry point
export { timestampsToCaptions } from "./captions.js";
export type {
  ClonedVoice,
  CloneVoiceOptions,
  VoiceSample,
} from "./clone-voice.js";
export { cloneVoice } from "./clone-voice.js";
export {
  ConversationInputError,
  DialogueConstraintError,
  MixedDispatchError,
  StitchUnsupportedError,
} from "./conversation/errors.js";
export {
  ApiError,
  AudioOutputInputError,
  CloneSampleFetchError,
  GatewayInputError,
  InvalidCloneFieldError,
  MissingApiKeyError,
  NoSpeechGeneratedError,
  OutputConversionUnsupportedError,
  SpeechSDKError,
  StreamingNotSupportedError,
  TextChunkingUnsupportedError,
  TimestampKeyMissingError,
  TooManyCloneSamplesError,
  UnsupportedSampleRateError,
  VoiceCloningUnsupportedError,
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
