import type { SpeechMetadata } from "./metadata.js";

export interface StreamSpeechResult {
  readonly audio: ReadableStream<Uint8Array>;
  readonly mediaType: string;
  readonly metadata: SpeechMetadata;
  readonly providerMetadata?: Record<string, unknown>;
  readonly warnings?: string[];
}
