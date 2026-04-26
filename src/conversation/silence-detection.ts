export interface SilenceGap {
  readonly durationMs: number;
  readonly endMs: number;
  readonly startMs: number;
}

export interface DetectSilenceOptions {
  readonly minDurationMs: number;
  readonly sampleRate: number;
  // RMS threshold below which a window is considered silent. Default tuned for int16 PCM dialogue.
  readonly silenceRmsThreshold?: number;
  // Window size for RMS computation in ms. Default 20ms.
  readonly windowMs?: number;
}

const DEFAULT_RMS_THRESHOLD = 200;
const DEFAULT_WINDOW_MS = 20;

export function detectSilenceGaps(
  pcm: Int16Array,
  options: DetectSilenceOptions
): readonly SilenceGap[] {
  const {
    sampleRate,
    minDurationMs,
    silenceRmsThreshold = DEFAULT_RMS_THRESHOLD,
    windowMs = DEFAULT_WINDOW_MS,
  } = options;

  if (pcm.length === 0 || sampleRate <= 0 || minDurationMs <= 0) {
    return [];
  }

  const windowSamples = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const windowCount = Math.floor(pcm.length / windowSamples);
  if (windowCount === 0) {
    return [];
  }

  // Mark each window as silent or not.
  const silent: boolean[] = new Array(windowCount);
  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSamples;
    let sumSq = 0;
    for (let i = 0; i < windowSamples; i++) {
      const s = pcm[start + i] ?? 0;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / windowSamples);
    silent[w] = rms < silenceRmsThreshold;
  }

  const gaps: SilenceGap[] = [];
  let runStart = -1;
  for (let w = 0; w <= windowCount; w++) {
    const isSilent = w < windowCount && silent[w];
    if (isSilent && runStart === -1) {
      runStart = w;
    } else if (!isSilent && runStart !== -1) {
      const startMs = (runStart * windowSamples * 1000) / sampleRate;
      const endMs = (w * windowSamples * 1000) / sampleRate;
      const durationMs = endMs - startMs;
      if (durationMs >= minDurationMs) {
        gaps.push({ startMs, endMs, durationMs });
      }
      runStart = -1;
    }
  }

  return gaps;
}

export function pickTopGaps(
  gaps: readonly SilenceGap[],
  n: number
): readonly SilenceGap[] {
  if (n <= 0 || gaps.length === 0) {
    return [];
  }
  const sortedByDuration = [...gaps].sort(
    (a, b) => b.durationMs - a.durationMs
  );
  const top = sortedByDuration.slice(0, n);
  return top.sort((a, b) => a.startMs - b.startMs);
}
