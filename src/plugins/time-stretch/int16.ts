export function int16ToFloat(sample: number): number {
  return sample < 0 ? sample / 32_768 : sample / 32_767;
}

export function floatToInt16(sample: number): number {
  if (sample <= -1) {
    return -32_768;
  }

  if (sample >= 1) {
    return 32_767;
  }

  return sample < 0 ? Math.round(sample * 32_768) : Math.round(sample * 32_767);
}

export function clampToInt16(value: number): number {
  if (value < -32_768) {
    return -32_768;
  }

  if (value > 32_767) {
    return 32_767;
  }

  return Math.round(value);
}

export function ensureExactLength(
  input: Int16Array,
  targetLength: number
): Int16Array {
  if (input.length === targetLength) {
    return input;
  }

  const output = new Int16Array(targetLength);
  output.set(input.subarray(0, targetLength));

  if (input.length > 0 && targetLength > input.length) {
    output.fill(input.at(-1) ?? 0, input.length);
  }

  return output;
}
