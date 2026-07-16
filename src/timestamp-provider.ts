import type { WordTimestamp } from "./timestamps.js";

export interface TimestampProvider {
  align(input: {
    readonly abortSignal?: AbortSignal;
    readonly audio: Uint8Array;
    readonly mediaType: string;
    readonly text: string;
  }): Promise<readonly WordTimestamp[]>;
}
