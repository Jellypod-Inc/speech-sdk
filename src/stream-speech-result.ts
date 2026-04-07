export interface StreamSpeechResult {
  readonly audio: ReadableStream<Uint8Array>;
  readonly mediaType: string;
  readonly providerMetadata?: Record<string, unknown>;
  readonly warnings?: string[];
}
