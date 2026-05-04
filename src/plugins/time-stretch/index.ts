import { normalizeInput } from "./bytes.js";
import { stretchLinear } from "./fallback.js";
import { ensureExactLength } from "./int16.js";
import { validateOptions } from "./validate.js";
import { getWsolaMinimumInputLength, stretchWsola } from "./wsola.js";

export interface TimeStretchOptions {
  /** Integer sample rate in Hz. Supported range: 8000-48000. */
  sampleRate: number;
  /** Target speed multiplier. 1.0 = unchanged duration. Supported range: 0.75-1.5. */
  speed: number;
}

export type TimeStretchInput = Int16Array | Uint8Array | ArrayBuffer;

/** Process a complete mono PCM buffer. Always returns a new Int16Array. */
export function timeStretch(
  input: TimeStretchInput,
  options: TimeStretchOptions
): Int16Array {
  const validated = validateOptions(options);
  const samples = normalizeInput(input);
  const targetLength = Math.round(samples.length / validated.speed);

  if (targetLength === 0) {
    return new Int16Array(0);
  }

  if (validated.speed === 1) {
    return ensureExactLength(samples.slice(), targetLength);
  }

  if (samples.length < getWsolaMinimumInputLength(validated.sampleRate)) {
    return stretchLinear(samples, targetLength);
  }

  return ensureExactLength(
    stretchWsola(samples, validated.speed, validated.sampleRate, targetLength),
    targetLength
  );
}
