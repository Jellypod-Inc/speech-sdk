import { parseMediaTypeParam, wrapPcm16Mono } from "../audio-utils.js";

export interface Pcm16Segment {
  readonly channels: number;
  readonly pcm: Int16Array;
  readonly sampleRate: number;
}

/**
 * View 16-bit little-endian PCM bytes as an Int16Array. Reuses the existing
 * buffer when `byteOffset` is 2-aligned; otherwise copies into a fresh,
 * aligned buffer (Int16Array's buffer view requires 2-byte alignment).
 */
function pcmBytesToInt16(bytes: Uint8Array): Int16Array {
  if (bytes.byteOffset % 2 === 0 && bytes.byteLength % 2 === 0) {
    return new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Int16Array(copy.buffer);
}

function downmixToMono(interleaved: Int16Array, channels: number): Int16Array {
  if (channels === 1) {
    return interleaved;
  }
  const frames = Math.floor(interleaved.length / channels);
  const out = new Int16Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += interleaved[f * channels + c];
    }
    out[f] = Math.round(sum / channels);
  }
  return out;
}

/** Decode a provider response to mono 16-bit PCM + its native sample rate. */
export function decodeToPcm16(
  data: Uint8Array,
  mediaType: string
): Pcm16Segment {
  const lower = mediaType.toLowerCase();

  if (
    lower.startsWith("audio/pcm") ||
    lower.startsWith("audio/l16") ||
    lower.startsWith("audio/x-pcm")
  ) {
    const sampleRate = parseMediaTypeParam(mediaType, "rate") ?? 24_000;
    const channels = parseMediaTypeParam(mediaType, "channels") ?? 1;
    const interleaved = pcmBytesToInt16(data);
    return {
      pcm: downmixToMono(interleaved, channels),
      sampleRate,
      channels: 1,
    };
  }

  if (lower.startsWith("audio/wav") || lower.startsWith("audio/x-wav")) {
    return decodeWav(data);
  }

  throw new Error(
    `conversation.pcm-concat: unsupported stitch mediaType "${mediaType}". ` +
      'getStitchOptions must return "audio/wav" or "audio/pcm;rate=..." so the stitch layer can concatenate without a compressed-audio decoder.'
  );
}

function decodeWav(bytes: Uint8Array): Pcm16Segment {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    view.getUint32(0) !== 0x52_49_46_46 ||
    view.getUint32(8) !== 0x57_41_56_45
  ) {
    throw new Error("conversation.pcm-concat: not a RIFF/WAVE file");
  }

  // Scan chunks for "fmt " and "data".
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let dataStart = -1;
  let dataLen = 0;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = view.getUint32(offset);
    const chunkSize = view.getUint32(offset + 4, true);
    if (chunkId === 0x66_6d_74_20) {
      audioFormat = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (chunkId === 0x64_61_74_61) {
      dataStart = offset + 8;
      dataLen = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (
    dataStart < 0 ||
    sampleRate === 0 ||
    bitsPerSample !== 16 ||
    audioFormat !== 1
  ) {
    throw new Error(
      `conversation.pcm-concat: only 16-bit PCM WAV is supported (got audioFormat=${audioFormat}, bps=${bitsPerSample})`
    );
  }

  const payload = bytes.subarray(dataStart, dataStart + dataLen);
  const interleaved = pcmBytesToInt16(payload);
  return {
    pcm: downmixToMono(interleaved, channels || 1),
    sampleRate,
    channels: 1,
  };
}

/** Simple linear interpolation resampler for mono Int16 PCM. */
export function resamplePcm16LinearMono(
  input: Int16Array,
  fromRate: number,
  toRate: number
): Int16Array {
  if (fromRate === toRate) {
    return input;
  }
  const ratio = fromRate / toRate;
  const outLen = Math.round(input.length / ratio);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = srcPos - i0;
    out[i] = Math.round(input[i0] * (1 - frac) + input[i1] * frac);
  }
  return out;
}

export function silencePcm16(ms: number, sampleRate: number): Int16Array {
  const samples = Math.round((ms / 1000) * sampleRate);
  return new Int16Array(samples);
}

/**
 * Resample each segment to `targetSampleRate` mono, interleave with `gapMs`
 * silence, and mux the result as a WAV file via mediabunny.
 */
export async function concatPcmToWav(
  segments: readonly Pcm16Segment[],
  options: { gapMs: number; targetSampleRate: number }
): Promise<Uint8Array> {
  const { gapMs, targetSampleRate } = options;

  const resampled: Int16Array[] = [];
  const gap = silencePcm16(gapMs, targetSampleRate);

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    resampled.push(
      resamplePcm16LinearMono(s.pcm, s.sampleRate, targetSampleRate)
    );
    if (i < segments.length - 1 && gap.length > 0) {
      resampled.push(gap);
    }
  }

  const totalSamples = resampled.reduce((n, a) => n + a.length, 0);
  const merged = new Int16Array(totalSamples);
  let off = 0;
  for (const a of resampled) {
    merged.set(a, off);
    off += a.length;
  }

  const mergedBytes = new Uint8Array(
    merged.buffer,
    merged.byteOffset,
    merged.byteLength
  );
  return await wrapPcm16Mono(mergedBytes, targetSampleRate);
}
