import type { AudioOutput } from "./audio-output.js";
import type { PronunciationsFor } from "./pronunciations/types.js";
import type { ResolvedModel, Voice } from "./speech-provider.js";

export type { AudioOutput, AudioOutputFormat } from "./audio-output.js";
export type { CaptionFormat, CaptionsOptions } from "./captions.js";
export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
export type { SpeechMetadata } from "./metadata.js";
export type {
  Pronunciation,
  PronunciationsInput,
} from "./pronunciations/types.js";
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
export type {
  ConversationWordTimestamp,
  WordTimestamp,
} from "./timestamps.js";
export type { TurnTimestamp } from "./turns.js";

export interface GenerateSpeechOptions<
  V extends Voice = Voice,
  M extends string | ResolvedModel<V> = string | ResolvedModel<V>,
> {
  abortSignal?: AbortSignal;
  apiKey?: string;
  headers?: Record<string, string>;
  // When the input exceeds the model's maxInputChars and the SDK chunks it locally, this caps how many chunk requests fire in parallel. Default 6. Set to 1 to serialize (e.g. when a provider's account-level concurrency is the bottleneck). Ignored on the gateway path — the gateway server owns request processing.
  maxConcurrency?: number;
  maxInputChars?: number;
  maxRetries?: number;
  model: M;
  // Gateway-only. Per-request override for the moderation ruleset; falls back to the org default if omitted or unknown. Throws ModerationRulesetIdRequiresGatewayError on direct-provider transports.
  moderationRulesetId?: string;
  output?: AudioOutput;
  pronunciations?: PronunciationsFor<M>;
  providerOptions?: Record<string, unknown>;
  text: string;
  timestamps?: boolean;
  voice: V;
  volumeDbfs?: number;
}
