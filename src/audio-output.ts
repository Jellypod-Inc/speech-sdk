import { decodeAudioToPcm16 } from "./audio-decode.js";
import { parseMediaTypeParam, wrapPcm16Mono } from "./audio-utils.js";
import { encodePcm16ToMp3 } from "./encoders/mp3.js";
import { AudioOutputInputError } from "./errors.js";

const DEFAULT_PCM_RATE = 24_000;

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
    throw new AudioOutputInputError(
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

function isDecodableSourceMediaType(mediaType: string): boolean {
  const lower = mediaType.toLowerCase();
  return (
    lower.startsWith("audio/wav") ||
    lower.startsWith("audio/x-wav") ||
    lower.startsWith("audio/pcm") ||
    lower.startsWith("audio/x-pcm")
  );
}

function isWavSource(mediaType: string): boolean {
  const lower = mediaType.toLowerCase();
  return lower.startsWith("audio/wav") || lower.startsWith("audio/x-wav");
}

function isMp3Source(mediaType: string): boolean {
  const lower = mediaType.toLowerCase();
  return lower.startsWith("audio/mpeg") || lower.startsWith("audio/mp3");
}

function isPcmSource(mediaType: string): boolean {
  const lower = mediaType.toLowerCase();
  return lower.startsWith("audio/pcm") || lower.startsWith("audio/x-pcm");
}

async function decodeToPcmBytes(audio: Uint8Array, mediaType: string) {
  const segment = await decodeAudioToPcm16(audio, mediaType);
  return {
    pcmBytes: new Uint8Array(
      segment.pcm.buffer,
      segment.pcm.byteOffset,
      segment.pcm.byteLength
    ),
    sampleRate: segment.sampleRate,
  };
}

export async function convertDecodableAudioToOutput(args: {
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly output: ResolvedAudioOutput;
}): Promise<{ readonly audio: Uint8Array; readonly mediaType: string }> {
  const { audio, mediaType, output } = args;

  if (output.format === "wav" && isWavSource(mediaType)) {
    return { audio, mediaType: "audio/wav" };
  }
  if (output.format === "mp3" && isMp3Source(mediaType)) {
    return { audio, mediaType: "audio/mpeg" };
  }
  if (output.format === "pcm" && isPcmSource(mediaType)) {
    // Some providers (e.g. OpenAI) return bare "audio/pcm" without rate;
    // normalize to mediaTypeForOutput so callers always know the rate.
    const sampleRate =
      parseMediaTypeParam(mediaType, "rate") ?? DEFAULT_PCM_RATE;
    return {
      audio,
      mediaType: mediaTypeForOutput({ format: "pcm", sampleRate }),
    };
  }

  if (!isDecodableSourceMediaType(mediaType)) {
    throw new AudioOutputInputError(
      `convertDecodableAudioToOutput: source mediaType "${mediaType}" is not decodable. Only audio/wav, audio/x-wav, audio/pcm, and audio/x-pcm are supported.`
    );
  }

  if (output.format === "wav") {
    const { pcmBytes, sampleRate } = await decodeToPcmBytes(audio, mediaType);
    const wav = await wrapPcm16Mono(pcmBytes, sampleRate);
    return { audio: wav, mediaType: "audio/wav" };
  }

  if (output.format === "pcm") {
    const { pcmBytes, sampleRate } = await decodeToPcmBytes(audio, mediaType);
    return {
      audio: pcmBytes,
      mediaType: mediaTypeForOutput({
        format: "pcm",
        sampleRate,
      }),
    };
  }

  const { pcmBytes, sampleRate } = await decodeToPcmBytes(audio, mediaType);
  const mp3 = await encodePcm16ToMp3({
    pcm: pcmBytes,
    sampleRate,
    bitrateKbps: output.bitrate,
  });
  return { audio: mp3, mediaType: "audio/mpeg" };
}

export async function applyOptionalOutputConversion(args: {
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly output: AudioOutput | undefined;
}): Promise<{ readonly audio: Uint8Array; readonly mediaType: string }> {
  if (!args.output) {
    return { audio: args.audio, mediaType: args.mediaType };
  }
  return await convertDecodableAudioToOutput({
    audio: args.audio,
    mediaType: args.mediaType,
    output: resolveOutputForLocalConversion(args.output),
  });
}
