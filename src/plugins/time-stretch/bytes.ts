import type { TimeStretchInput } from "./index.js";
import { assertSupportedInput, assertValidByteInput } from "./validate.js";

export function normalizeInput(input: TimeStretchInput): Int16Array {
  assertSupportedInput(input);

  if (input instanceof Int16Array) {
    return input;
  }

  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  assertValidByteInput(bytes);
  return decodeS16le(bytes);
}

function decodeS16le(bytes: Uint8Array): Int16Array {
  const output = new Int16Array(bytes.byteLength / 2);

  for (
    let byteIndex = 0, sampleIndex = 0;
    byteIndex < bytes.byteLength;
    byteIndex += 2, sampleIndex += 1
  ) {
    const lo = bytes[byteIndex] ?? 0;
    const hi = bytes[byteIndex + 1] ?? 0;
    // biome-ignore lint/suspicious/noBitwiseOperators: combining s16le bytes into an int16 sample
    const value = lo | (hi << 8);
    output[sampleIndex] = value >= 0x80_00 ? value - 0x1_00_00 : value;
  }

  return output;
}
