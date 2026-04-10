import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

// biome-ignore lint/performance/useTopLevelRegex: single-use parser
const IS_RAW_PCM = /^audio\/(l16|pcm|x-pcm)\b/i;
// biome-ignore lint/performance/useTopLevelRegex: single-use parser
const RATE_PARAM = /(?:^|;)\s*rate=(\d+)/i;

/**
 * Compute audio duration in milliseconds from raw audio bytes.
 * Uses mediabunny to parse container formats (MP3, WAV, Ogg, FLAC, etc.).
 * For raw PCM (L16, audio/pcm with rate), computes duration from byte length.
 * Returns undefined if the format cannot be determined.
 */
export async function computeAudioDuration(
  data: Uint8Array | string,
  mediaType: string
): Promise<number | undefined> {
  const bytes = data instanceof Uint8Array ? data : base64ToUint8Array(data);

  const pcmDuration = computePcmDuration(bytes, mediaType);
  if (pcmDuration != null) {
    return pcmDuration;
  }

  try {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mediaType });
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      return undefined;
    }
    const durationSeconds = await track.computeDuration();
    return Math.round(durationSeconds * 1000);
  } catch {
    return undefined;
  }
}

/**
 * Compute duration for raw PCM formats (audio/L16, audio/pcm) which don't
 * have a container header. Duration = sampleCount / sampleRate, assuming
 * 16-bit mono (the common TTS output).
 */
function computePcmDuration(
  bytes: Uint8Array,
  mediaType: string
): number | undefined {
  if (!IS_RAW_PCM.test(mediaType)) {
    return undefined;
  }
  const rateMatch = mediaType.match(RATE_PARAM);
  if (!rateMatch) {
    return undefined;
  }
  const sampleRate = Number(rateMatch[1]);
  // L16/PCM = 16-bit linear PCM, assume mono (most TTS output)
  const bytesPerSample = 2;
  return Math.round((bytes.length / bytesPerSample / sampleRate) * 1000);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
