import { floatToInt16, int16ToFloat } from "./int16.js";

interface WsolaParameters {
  correlationStep: number;
  searchRadius: number;
  synthesisHop: number;
  windowSize: number;
}

export function getWsolaMinimumInputLength(sampleRate: number): number {
  const { windowSize, searchRadius } = getWsolaParameters(sampleRate);
  return windowSize + searchRadius * 2;
}

export function stretchWsola(
  input: Int16Array,
  speed: number,
  sampleRate: number,
  targetLength: number
): Int16Array {
  const params = getWsolaParameters(sampleRate);
  const source = toFloat(input);
  const window = createHannWindow(params.windowSize);
  const tempLength = targetLength + params.windowSize;
  const accumulator = new Float32Array(tempLength);
  const weights = new Float32Array(tempLength);

  let outputPosition = 0;
  let expectedInputPosition = 0;
  let previousInputPosition = 0;
  const analysisHop = params.synthesisHop * speed;
  const maxInputPosition = Math.max(0, source.length - params.windowSize);

  overlapAdd(source, accumulator, weights, window, 0, 0, params.windowSize);

  outputPosition += params.synthesisHop;
  expectedInputPosition += analysisHop;

  while (outputPosition < targetLength) {
    const expected = clampInteger(
      Math.round(expectedInputPosition),
      0,
      maxInputPosition
    );
    const chosen = chooseBestOffset(
      source,
      accumulator,
      weights,
      outputPosition,
      expected,
      previousInputPosition,
      params
    );

    overlapAdd(
      source,
      accumulator,
      weights,
      window,
      chosen,
      outputPosition,
      params.windowSize
    );

    previousInputPosition = chosen;
    outputPosition += params.synthesisHop;
    expectedInputPosition += analysisHop;
  }

  return normalizeOutput(accumulator, weights, source, speed, targetLength);
}

function getWsolaParameters(sampleRate: number): WsolaParameters {
  const windowSize = makeEven(Math.round(sampleRate * 0.03));
  const synthesisHop = Math.max(16, makeEven(Math.round(windowSize / 4)));
  const searchRadius = makeEven(Math.round(sampleRate * 0.01));
  const correlationStep = Math.max(4, Math.floor(sampleRate / 3000));

  return {
    windowSize,
    synthesisHop,
    searchRadius,
    correlationStep,
  };
}

function toFloat(input: Int16Array): Float32Array {
  const output = new Float32Array(input.length);

  for (let index = 0; index < input.length; index += 1) {
    output[index] = int16ToFloat(input[index] ?? 0);
  }

  return output;
}

function createHannWindow(size: number): Float32Array {
  const window = new Float32Array(size);

  for (let index = 0; index < size; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (index + 0.5)) / size);
  }

  return window;
}

function overlapAdd(
  source: Float32Array,
  accumulator: Float32Array,
  weights: Float32Array,
  window: Float32Array,
  inputPosition: number,
  outputPosition: number,
  windowSize: number
): void {
  for (let index = 0; index < windowSize; index += 1) {
    const outputIndex = outputPosition + index;

    if (outputIndex >= accumulator.length) {
      break;
    }

    const weight = window[index] ?? 0;
    accumulator[outputIndex] =
      (accumulator[outputIndex] ?? 0) +
      (source[inputPosition + index] ?? 0) * weight;
    weights[outputIndex] = (weights[outputIndex] ?? 0) + weight;
  }
}

function chooseBestOffset(
  source: Float32Array,
  accumulator: Float32Array,
  weights: Float32Array,
  outputPosition: number,
  expectedInputPosition: number,
  previousInputPosition: number,
  params: WsolaParameters
): number {
  const overlapLength = params.windowSize - params.synthesisHop;
  const maxInputPosition = Math.max(0, source.length - params.windowSize);
  const minCandidate = clampInteger(
    Math.max(
      expectedInputPosition - params.searchRadius,
      previousInputPosition + 1
    ),
    0,
    maxInputPosition
  );
  const maxCandidate = clampInteger(
    expectedInputPosition + params.searchRadius,
    0,
    maxInputPosition
  );

  if (minCandidate >= maxCandidate) {
    return clampInteger(expectedInputPosition, 0, maxInputPosition);
  }

  let bestCandidate = minCandidate;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (
    let candidate = minCandidate;
    candidate <= maxCandidate;
    candidate += params.correlationStep
  ) {
    const score = correlationScore(
      source,
      accumulator,
      weights,
      candidate,
      outputPosition,
      overlapLength,
      params.correlationStep
    );

    if (score > bestScore) {
      bestScore = score;
      bestCandidate = candidate;
    }
  }

  if (bestScore === Number.NEGATIVE_INFINITY) {
    return clampInteger(expectedInputPosition, 0, maxInputPosition);
  }

  return refineOffset(
    source,
    accumulator,
    weights,
    bestCandidate,
    minCandidate,
    maxCandidate,
    outputPosition,
    overlapLength
  );
}

function correlationScore(
  source: Float32Array,
  accumulator: Float32Array,
  weights: Float32Array,
  inputPosition: number,
  outputPosition: number,
  overlapLength: number,
  step: number
): number {
  let correlation = 0;
  let candidateEnergy = 0;
  let referenceEnergy = 0;
  let compared = 0;

  for (let index = 0; index < overlapLength; index += step) {
    const outputIndex = outputPosition + index;

    if (outputIndex >= accumulator.length) {
      break;
    }

    const weight = weights[outputIndex] ?? 0;
    if (weight <= 1e-6) {
      continue;
    }

    const reference = (accumulator[outputIndex] ?? 0) / weight;
    const candidate = source[inputPosition + index] ?? 0;

    correlation += reference * candidate;
    candidateEnergy += candidate * candidate;
    referenceEnergy += reference * reference;
    compared += 1;
  }

  if (compared === 0 || candidateEnergy <= 1e-12 || referenceEnergy <= 1e-12) {
    return Number.NEGATIVE_INFINITY;
  }

  return correlation / Math.sqrt(candidateEnergy * referenceEnergy);
}

function refineOffset(
  source: Float32Array,
  accumulator: Float32Array,
  weights: Float32Array,
  bestCandidate: number,
  minCandidate: number,
  maxCandidate: number,
  outputPosition: number,
  overlapLength: number
): number {
  const refineStart = Math.max(minCandidate, bestCandidate - 3);
  const refineEnd = Math.min(maxCandidate, bestCandidate + 3);
  let refinedCandidate = bestCandidate;
  let refinedScore = Number.NEGATIVE_INFINITY;

  for (let candidate = refineStart; candidate <= refineEnd; candidate += 1) {
    const score = correlationScore(
      source,
      accumulator,
      weights,
      candidate,
      outputPosition,
      overlapLength,
      2
    );

    if (score > refinedScore) {
      refinedScore = score;
      refinedCandidate = candidate;
    }
  }

  return refinedCandidate;
}

function normalizeOutput(
  accumulator: Float32Array,
  weights: Float32Array,
  source: Float32Array,
  speed: number,
  targetLength: number
): Int16Array {
  const output = new Int16Array(targetLength);

  for (let index = 0; index < targetLength; index += 1) {
    const weight = weights[index] ?? 0;
    const value =
      weight > 1e-6
        ? (accumulator[index] ?? 0) / weight
        : (source[Math.min(source.length - 1, Math.round(index * speed))] ?? 0);

    output[index] = floatToInt16(value);
  }

  return output;
}

function makeEven(value: number): number {
  return value % 2 === 0 ? value : value + 1;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
