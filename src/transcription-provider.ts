import type { WordTimestamp } from "./timestamps.js";

/** Blind speech-to-text with word timings in seconds, used to hear what a voice actually said. */
export interface TranscriptionProvider {
  transcribe(input: {
    readonly abortSignal?: AbortSignal;
    readonly audio: Uint8Array;
    readonly mediaType: string;
  }): Promise<readonly WordTimestamp[]>;
}
