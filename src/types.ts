import type { AudioOutput } from "./audio-output.js";
import type { PronunciationsInput } from "./pronunciations/types.js";
import type { ResolvedModel, Voice } from "./speech-provider.js";
import type { TimestampProvider } from "./timestamp-provider.js";

export type { AudioOutput, AudioOutputFormat } from "./audio-output.js";
export type { CaptionFormat, CaptionsOptions } from "./captions.js";
export type {
  ClonedVoice,
  CloneVoiceOptions,
  SpeechProviderFactory,
  VoiceSample,
} from "./clone-voice.js";
export type {
  ConversationTurn,
  GenerateConversationOptions,
} from "./conversation/types.js";
export type {
  DesignedVoice,
  DesignVoiceOptions,
  VoiceDesignPreview,
} from "./design-voice.js";
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
export type { GradiumSpeechProviderConfig } from "./providers/gradium/index.js";
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
  ConversationResultWithTimestamps,
  GeneratedAudioFile,
  SpeechResult,
  SpeechResultWithTimestamps,
} from "./speech-result.js";
export type {
  ResolvedSTTModel,
  SpeechToTextProvider,
  STTModelInfo,
} from "./speech-to-text-provider.js";
export type { StreamSpeechResult } from "./stream-speech-result.js";
export type { TimestampProvider } from "./timestamp-provider.js";
export type {
  ConversationWordTimestamp,
  TimestampsSource,
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
  /** Non-spoken delivery direction. The selected model must declare instruction support. */
  instructions?: string;
  // When the input exceeds the model's maxInputChars and the SDK chunks it locally, this caps how many chunk requests fire in parallel. Default 6. Set to 1 to serialize (e.g. when a provider's account-level concurrency is the bottleneck). Ignored on the gateway path — the gateway server owns request processing.
  maxConcurrency?: number;
  maxInputChars?: number;
  maxRetries?: number;
  model: M;
  output?: AudioOutput;
  pronunciations?: PronunciationsInput;
  providerOptions?: Record<string, unknown>;
  // Time-stretch the final audio. 1 = unchanged, <1 slower, >1 faster. Range 0.75–1.5. Mono only. Decodes → time-stretches → re-encodes (preserving `output` format if set, else WAV). Scales timestamps and audioDurationMs.
  speed?: number;
  /** The exact spoken transcript expected in the generated audio. */
  text: string;
  timestampProvider?: TimestampProvider;
  timestamps?: boolean;
  voice: V;
  volumeDbfs?: number;
}
