import type { ResolvedModel, Voice } from "./speech-provider.js";

export type { CaptionFormat, CaptionsOptions } from "./captions.js";
export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
export type { SpeechMetadata } from "./metadata.js";
export type { CartesiaSpeechProviderConfig } from "./providers/cartesia/index.js";
export type { DeepgramSpeechProviderConfig } from "./providers/deepgram/index.js";
export type { ElevenLabsSpeechProviderConfig } from "./providers/elevenlabs/index.js";
export type { FalSpeechProviderConfig } from "./providers/fal/index.js";
export type { FishAudioSpeechProviderConfig } from "./providers/fish-audio/index.js";
export type { SpeechGatewayProviderConfig } from "./providers/gateway/index.js";
export type { GoogleSpeechProviderConfig } from "./providers/google/index.js";
export type { HumeSpeechProviderConfig } from "./providers/hume/index.js";
export type { InworldSpeechProviderConfig } from "./providers/inworld/index.js";
export type { MistralSpeechProviderConfig } from "./providers/mistral/index.js";
export type { MurfSpeechProviderConfig } from "./providers/murf/index.js";
export type { OpenAISpeechProviderConfig } from "./providers/openai/index.js";
export type { ResembleSpeechProviderConfig } from "./providers/resemble/index.js";
export type { XaiSpeechProviderConfig } from "./providers/xai/index.js";
export type {
  Feature,
  ModelInfo,
  ResolvedModel,
  SpeechProvider,
  Voice,
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
export type { StreamSpeechResult } from "./stream-speech-result.js";
export type { OpenAISpeechToTextProviderConfig } from "./stt-providers/openai/index.js";
export type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "./timestamps.js";
export type { TurnTimestamp } from "./turns.js";

export interface GenerateSpeechOptions<V extends Voice = Voice> {
  abortSignal?: AbortSignal;
  apiKey?: string;
  headers?: Record<string, string>;
  maxRetries?: number;
  model: string | ResolvedModel<V>;
  providerOptions?: Record<string, unknown>;
  text: string;
  timestamps?: boolean;
  voice: V;
  volumeDbfs?: number;
}
