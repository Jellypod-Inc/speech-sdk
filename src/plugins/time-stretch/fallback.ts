import { clampToInt16 } from "./int16.js";

export function stretchLinear(
  input: Int16Array,
  targetLength: number
): Int16Array {
  const output = new Int16Array(targetLength);

  if (targetLength === 0 || input.length === 0) {
    return output;
  }

  if (input.length === 1) {
    output.fill(input[0] ?? 0);
    return output;
  }

  if (targetLength === 1) {
    output[0] = input[0] ?? 0;
    return output;
  }

  const scale = (input.length - 1) / (targetLength - 1);

  for (let outputIndex = 0; outputIndex < targetLength; outputIndex += 1) {
    const position = outputIndex * scale;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, input.length - 1);
    const fraction = position - leftIndex;
    const left = input[leftIndex] ?? 0;
    const right = input[rightIndex] ?? left;

    output[outputIndex] = clampToInt16(left + (right - left) * fraction);
  }

  return output;
}
