import { resamplePcm16, wrapPcm16Mono } from "../audio-utils.js";

export interface Pcm16Segment {
  readonly channels: number;
  readonly pcm: Int16Array;
  readonly sampleRate: number;
}

const INT16_MAX = 32_767;
const INT16_MIN = -32_768;

function silencePcm16(ms: number, sampleRate: number): Int16Array {
  const samples = Math.round((ms / 1000) * sampleRate);
  return new Int16Array(samples);
}

function rmsPcm16(pcm: Int16Array): number {
  if (pcm.length === 0) {
    return 0;
  }
  let sumSq = 0;
  for (const s of pcm) {
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / pcm.length);
}

function clampInt16(value: number): number {
  if (value > INT16_MAX) {
    return INT16_MAX;
  }
  if (value < INT16_MIN) {
    return INT16_MIN;
  }
  return value;
}

function scaleClamp(pcm: Int16Array, gain: number): Int16Array {
  const out = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = clampInt16(Math.round(pcm[i] * gain));
  }
  return out;
}

// −20 dBFS: broadcast/podcast voice loudness with ~20 dB peak headroom.
export const DEFAULT_VOLUME_DBFS = -20;

export function dbfsToInt16Rms(dbfs: number): number {
  return Math.round(INT16_MAX * 10 ** (dbfs / 20));
}

const DEFAULT_TARGET_RMS_INT16 = dbfsToInt16Rms(DEFAULT_VOLUME_DBFS);

// Per-segment, no cross-segment coupling — gives consistent loudness across runs.
export function normalizeRms(
  segments: readonly Pcm16Segment[],
  targetRmsAmplitude = DEFAULT_TARGET_RMS_INT16
): Pcm16Segment[] {
  return segments.map((s) => {
    const segRms = rmsPcm16(s.pcm);
    if (segRms === 0) {
      return { ...s };
    }
    return { ...s, pcm: scaleClamp(s.pcm, targetRmsAmplitude / segRms) };
  });
}

export async function concatPcmToWav(
  segments: readonly Pcm16Segment[],
  options: { gapMs: number; targetSampleRate: number }
): Promise<Uint8Array> {
  const { gapMs, targetSampleRate } = options;

  const gap = silencePcm16(gapMs, targetSampleRate);
  const resampledSegments = await Promise.all(
    segments.map((s) => resamplePcm16(s.pcm, s.sampleRate, targetSampleRate))
  );

  const resampled: Int16Array[] = [];
  for (let i = 0; i < resampledSegments.length; i++) {
    resampled.push(resampledSegments[i]);
    if (i < resampledSegments.length - 1 && gap.length > 0) {
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
