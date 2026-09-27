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
  readonly timestamps?: readonly WordTimestamp[];
  readonly warnings?: string[];
}

export interface SpeechResultWithTimestamps extends SpeechResult {
  readonly timestamps: readonly WordTimestamp[];
}

/** How `generateConversation` rendered the audio. */
export type ConversationPathKind = "native" | "native-split" | "stitch";

/** Why a conversation was rendered turn by turn instead of as native dialogue. */
export type ConversationStitchReason =
  | "custom-voice"
  | "max-input-chars"
  | "mixed-models"
  | "native-limit-exceeded"
  | "no-native-dialogue"
  | "per-turn-provider-options"
  | "per-turn-speed"
  | "single-speaker"
  | "too-many-voices";

/**
 * How words were assigned to turns in mixed dialogue audio: `silence` (text match confirmed by a
 * silence at every boundary), `text` (text match only), or `proportional` (approximate).
 */
export type ConversationAttribution = "silence" | "text" | "proportional";

export interface ConversationMetadata extends SpeechMetadata {
  // Weakest tier across native dialogue calls. Unset on the stitch path (each turn is its own call) and without timestamps.
  readonly attribution?: ConversationAttribution;
  readonly path: ConversationPathKind;
  // Populated on the stitch path (one generateSpeech call per turn). Undefined on the native dialogue
  // path, where per-turn boundaries don't exist as separate provider calls.
  readonly perTurn?: readonly SpeechMetadata[];
  // Set on the stitch path.
  readonly stitchReason?: ConversationStitchReason;
}

/** One input turn's slice of the conversation audio. */
export interface ConversationTurnAudio {
  /** Same format as the conversation `audio`. */
  readonly audio: GeneratedAudioFile;
  readonly endMs: number;
  readonly startMs: number;
  /** Word timings in seconds from the start of this turn's audio. */
  readonly timestamps: readonly WordTimestamp[];
  readonly turnIndex: number;
}

export interface ConversationResult
  extends Omit<SpeechResult, "metadata" | "timestamps"> {
  readonly metadata: ConversationMetadata;
  readonly timestamps?: readonly ConversationWordTimestamp[];
  // Set when `splitTurns: true`: one entry per input turn, in order, covering the whole audio.
  readonly turns?: readonly ConversationTurnAudio[];
}

export interface ConversationResultWithTimestamps extends ConversationResult {
  readonly timestamps: readonly ConversationWordTimestamp[];
}

export interface ConversationResultWithTurns
  extends ConversationResultWithTimestamps {
  readonly turns: readonly ConversationTurnAudio[];
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
