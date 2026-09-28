import { type DecodedPcm16, decodeAudioToPcm16 } from "./audio-decode.js";
import { base64ToUint8Array } from "./audio-utils.js";
import {
  concatPcmToWav,
  dbfsToInt16Rms,
  normalizeRms,
} from "./conversation/pcm-concat.js";

interface AdjustVolumeInput {
  readonly audio: string | Uint8Array;
  readonly mediaType: string;
  readonly volumeDbfs: number;
}

export async function adjustVolume(
  input: AdjustVolumeInput
): Promise<Uint8Array> {
  const bytes =
    input.audio instanceof Uint8Array
      ? input.audio
      : base64ToUint8Array(input.audio);

  return await normalizeVolumeToWav(
    await decodeAudioToPcm16(bytes, input.mediaType),
    input.volumeDbfs
  );
}

export async function normalizeVolumeToWav(
  segment: DecodedPcm16,
  volumeDbfs: number
): Promise<Uint8Array> {
  const [normalized] = normalizeRms([segment], dbfsToInt16Rms(volumeDbfs));

  return await concatPcmToWav([normalized], {
    gapMs: 0,
    targetSampleRate: normalized.sampleRate,
  });
}
