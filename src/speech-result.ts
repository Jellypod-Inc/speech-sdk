import type { SpeechMetadata } from "./metadata.js";
import type { ConversationWordTimestamp, WordTimestamp } from "./timestamps.js";

export interface GeneratedAudioFile {
  readonly base64: string;
  readonly mediaType: string;
  readonly uint8Array: Uint8Array;
}

export interface SpeechResult {
  readonly audio: GeneratedAudioFile;
  readonly metadata: SpeechMetadata;
  readonly providerMetadata?: Record<string, unknown>;
  /**
   * Word-level alignment data. Populated when `timestamps: "on"` is passed —
   * native alignment when the TTS provider returns it, otherwise derived via
   * an STT round-trip. Undefined when timestamps are off (the default).
   *
   * Timestamps are always word-granularity with start/end in seconds.
   * Character- or phoneme-level native data is aggregated internally.
   */
  readonly timestamps?: readonly WordTimestamp[];
  readonly warnings?: string[];
}

/**
 * Result returned by `generateConversation()`. Identical to `SpeechResult`
 * except that every word timestamp also carries a `turnIndex` pointing back
 * into the input `turns[]` array. Because `ConversationWordTimestamp`
 * extends `WordTimestamp`, callers that previously read `.text/.start/.end`
 * keep working unchanged.
 */
export interface ConversationResult extends Omit<SpeechResult, "timestamps"> {
  readonly timestamps?: readonly ConversationWordTimestamp[];
}

export class DefaultGeneratedAudioFile implements GeneratedAudioFile {
  readonly mediaType: string;

  private readonly _data: string | Uint8Array;
  private _uint8Array?: Uint8Array;
  private _base64?: string;

  constructor({
    data,
    mediaType,
  }: { data: string | Uint8Array; mediaType: string }) {
    this._data = data;
    this.mediaType = mediaType;
  }

  get uint8Array(): Uint8Array {
    if (this._uint8Array != null) {
      return this._uint8Array;
    }
    if (this._data instanceof Uint8Array) {
      this._uint8Array = this._data;
    } else {
      const binaryString = atob(this._data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this._uint8Array = bytes;
    }
    return this._uint8Array;
  }

  get base64(): string {
    if (this._base64 != null) {
      return this._base64;
    }
    if (typeof this._data === "string") {
      this._base64 = this._data;
    } else {
      let binaryString = "";
      for (const byte of this._data) {
        binaryString += String.fromCharCode(byte);
      }
      this._base64 = btoa(binaryString);
    }
    return this._base64;
  }
}
