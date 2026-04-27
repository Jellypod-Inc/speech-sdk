export type AudioOutput =
  | { readonly format: "wav" }
  | { readonly format: "pcm" }
  | { readonly format: "mp3"; readonly bitrate?: number };

export type AudioOutputFormat = AudioOutput["format"];

export const DEFAULT_MP3_BITRATE_KBPS = 96;

export type ResolvedAudioOutput =
  | { readonly format: "wav" }
  | { readonly format: "pcm"; readonly sampleRate?: number }
  | { readonly format: "mp3"; readonly bitrate: number };

export function validateOutput<T extends AudioOutput | undefined>(
  output: T
): T {
  if (output?.format !== "mp3" && output != null && "bitrate" in output) {
    throw new Error(
      `audio-output: bitrate is only valid for format "mp3" (got format="${output.format}")`
    );
  }
  return output;
}

export function resolveOutputForLocalConversion(
  output: AudioOutput
): ResolvedAudioOutput {
  validateOutput(output);
  if (output.format === "mp3") {
    return {
      format: "mp3",
      bitrate: output.bitrate ?? DEFAULT_MP3_BITRATE_KBPS,
    };
  }
  return output;
}

export function mediaTypeForOutput(output: ResolvedAudioOutput): string {
  if (output.format === "wav") {
    return "audio/wav";
  }
  if (output.format === "mp3") {
    return "audio/mpeg";
  }
  return `audio/pcm;rate=${output.sampleRate ?? 24_000}`;
}
