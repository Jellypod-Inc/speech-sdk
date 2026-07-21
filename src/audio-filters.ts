import type { Pcm16Segment } from "./conversation/pcm-concat.js";

/**
 * A tonal filter applied to decoded PCM before volume normalization. Filters
 * run in order on the local (non-gateway) post-processing path, are
 * time-preserving (word timestamps stay aligned), and carry no defaults: the
 * SDK supplies the mechanism, callers supply the curve.
 */
export type AudioFilter =
  | { readonly type: "highpass"; readonly frequencyHz: number }
  | {
      readonly type: "lowshelf";
      readonly frequencyHz: number;
      readonly gainDb: number;
    };

const BUTTERWORTH_Q = Math.SQRT1_2;
const SHELF_GAIN_EXPONENT_DIVISOR = 40;
const INT16_MAX = 32_767;
const INT16_MIN = -32_768;
const NYQUIST_DIVISOR = 2;

interface BiquadCoefficients {
  readonly a1: number;
  readonly a2: number;
  readonly b0: number;
  readonly b1: number;
  readonly b2: number;
}

export function validateFilters(
  filters: readonly AudioFilter[] | undefined
): void {
  if (!filters) {
    return;
  }
  for (const filter of filters) {
    if (!(Number.isFinite(filter.frequencyHz) && filter.frequencyHz > 0)) {
      throw new RangeError(
        `Filter frequencyHz must be a positive finite number, got ${filter.frequencyHz}.`
      );
    }
    if (filter.type === "lowshelf" && !Number.isFinite(filter.gainDb)) {
      throw new RangeError(
        `Low-shelf gainDb must be a finite number, got ${filter.gainDb}.`
      );
    }
  }
}

function highPassCoefficients(
  frequencyHz: number,
  sampleRate: number
): BiquadCoefficients {
  const w0 = (2 * Math.PI * frequencyHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * BUTTERWORTH_Q);
  const a0 = 1 + alpha;
  return {
    a1: (-2 * cosW0) / a0,
    a2: (1 - alpha) / a0,
    b0: (1 + cosW0) / 2 / a0,
    b1: -(1 + cosW0) / a0,
    b2: (1 + cosW0) / 2 / a0,
  };
}

function lowShelfCoefficients(
  frequencyHz: number,
  gainDb: number,
  sampleRate: number
): BiquadCoefficients {
  const amplitude = 10 ** (gainDb / SHELF_GAIN_EXPONENT_DIVISOR);
  const w0 = (2 * Math.PI * frequencyHz) / sampleRate;
  const cosW0 = Math.cos(w0);
  const alpha = Math.sin(w0) / 2 / BUTTERWORTH_Q;
  const sqrtTerm = 2 * Math.sqrt(amplitude) * alpha;
  const a0 = amplitude + 1 + (amplitude - 1) * cosW0 + sqrtTerm;
  return {
    a1: (-2 * (amplitude - 1 + (amplitude + 1) * cosW0)) / a0,
    a2: (amplitude + 1 + (amplitude - 1) * cosW0 - sqrtTerm) / a0,
    b0: (amplitude * (amplitude + 1 - (amplitude - 1) * cosW0 + sqrtTerm)) / a0,
    b1: (2 * amplitude * (amplitude - 1 - (amplitude + 1) * cosW0)) / a0,
    b2: (amplitude * (amplitude + 1 - (amplitude - 1) * cosW0 - sqrtTerm)) / a0,
  };
}

function coefficientsFor(
  filter: AudioFilter,
  sampleRate: number
): BiquadCoefficients {
  if (filter.type === "highpass") {
    return highPassCoefficients(filter.frequencyHz, sampleRate);
  }
  return lowShelfCoefficients(filter.frequencyHz, filter.gainDb, sampleRate);
}

// Direct Form II transposed; one independent filter state per channel so
// multichannel audio never cross-bleeds.
function runBiquad(
  samples: Float64Array,
  channels: number,
  coefficients: BiquadCoefficients
): void {
  const { b0, b1, b2, a1, a2 } = coefficients;
  for (let channel = 0; channel < channels; channel += 1) {
    let s1 = 0;
    let s2 = 0;
    for (let i = channel; i < samples.length; i += channels) {
      const x = samples[i];
      const y = b0 * x + s1;
      s1 = b1 * x - a1 * y + s2;
      s2 = b2 * x - a2 * y;
      samples[i] = y;
    }
  }
}

/**
 * Applies the given filters to a PCM16 segment and returns a new segment of
 * identical length and timing. Filters whose corner frequency is at or above
 * Nyquist for the segment's sample rate are skipped rather than producing an
 * unstable filter.
 */
export function applyFiltersToSegment<T extends Pcm16Segment>(
  segment: T,
  filters: readonly AudioFilter[]
): T {
  const applicable = filters.filter(
    (filter) => filter.frequencyHz < segment.sampleRate / NYQUIST_DIVISOR
  );
  if (applicable.length === 0 || segment.pcm.length === 0) {
    return segment;
  }

  const samples = new Float64Array(segment.pcm.length);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = segment.pcm[i];
  }
  for (const filter of applicable) {
    runBiquad(
      samples,
      segment.channels,
      coefficientsFor(filter, segment.sampleRate)
    );
  }

  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    pcm[i] = Math.max(INT16_MIN, Math.min(INT16_MAX, Math.round(samples[i])));
  }
  return { ...segment, pcm };
}
