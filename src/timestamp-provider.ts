import type { WordTimestamp } from "./timestamps.js";

export interface TimestampProvider {
  align(input: {
    readonly abortSignal?: AbortSignal;
    readonly audio: Uint8Array;
    readonly mediaType: string;
    readonly text: string;
  }): Promise<readonly WordTimestamp[]>;
  /** Optional blind transcription on the same service; when present, the SDK also uses it for the spoken-tag check. */
  transcribe?(input: {
    readonly abortSignal?: AbortSignal;
    readonly audio: Uint8Array;
    readonly mediaType: string;
  }): Promise<readonly WordTimestamp[]>;
}
