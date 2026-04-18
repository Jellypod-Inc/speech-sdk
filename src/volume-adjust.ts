import {
  concatPcmToWav,
  dbfsToInt16Rms,
  decodeToPcm16,
  normalizeRms,
} from "./conversation/pcm-concat.js";

interface AdjustVolumeInput {
  readonly audio: string | Uint8Array;
  readonly mediaType: string;
  readonly volumeDbfs: number;
}

/**
 * Decode the provider's PCM/WAV output, RMS-normalize to the target dBFS,
 * and re-encode as 16-bit mono WAV. Lazy-loaded by generateSpeech only when
 * `volumeDbfs` is set so callers that never use volume adjustment don't pay
 * for the WAV mux dependency chain at import time.
 */
export async function adjustVolume(
  input: AdjustVolumeInput
): Promise<Uint8Array> {
  const bytes =
    input.audio instanceof Uint8Array
      ? input.audio
      : base64ToUint8Array(input.audio);

  const segment = decodeToPcm16(bytes, input.mediaType);
  const [normalized] = normalizeRms(
    [segment],
    dbfsToInt16Rms(input.volumeDbfs)
  );

  return await concatPcmToWav([normalized], {
    gapMs: 0,
    targetSampleRate: normalized.sampleRate,
  });
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const out = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    out[i] = binaryString.charCodeAt(i);
  }
  return out;
}
