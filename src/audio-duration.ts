import { ALL_FORMATS, BlobSource, Input } from "mediabunny";
import { base64ToUint8Array } from "./audio-utils.js";

export async function computeAudioDuration(
  data: Uint8Array | string,
  mediaType: string
): Promise<number | undefined> {
  try {
    const bytes = data instanceof Uint8Array ? data : base64ToUint8Array(data);
    // .slice() copies into a fresh ArrayBuffer (Blob accepts ArrayBuffer-backed views, not SharedArrayBuffer).
    const blob = new Blob([bytes.slice()], { type: mediaType });
    const input = new Input({
      source: new BlobSource(blob),
      formats: ALL_FORMATS,
    });
    const track = await input.getPrimaryAudioTrack();
    if (!track) {
      return;
    }
    const durationSeconds = await track.computeDuration();
    return Math.round(durationSeconds * 1000);
  } catch {
    return;
  }
}
