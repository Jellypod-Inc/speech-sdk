import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

/**
 * Compute audio duration in milliseconds from raw audio bytes.
 * Uses mediabunny to parse the audio container (MP3, WAV, Ogg, FLAC, etc.)
 * and extract duration. Returns undefined if parsing fails.
 */
export async function computeAudioDuration(
  data: Uint8Array | string,
  mediaType: string
): Promise<number | undefined> {
  try {
    const bytes = data instanceof Uint8Array ? data : base64ToUint8Array(data);
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

function base64ToUint8Array(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
