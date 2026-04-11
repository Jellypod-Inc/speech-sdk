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
    // Copy to a fresh ArrayBuffer so we pass exactly the Uint8Array view's
    // bytes — not the entire underlying buffer (which may be larger when
    // bytes is a subarray) and satisfies Blob's BlobPart type.
    const ab = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(ab).set(bytes);
    const blob = new Blob([ab], { type: mediaType });
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
