import { decodeAudioToPcm16 } from "./audio-decode.js";
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

  const segment = await decodeAudioToPcm16(bytes, input.mediaType);
  const [normalized] = normalizeRms(
    [segment],
    dbfsToInt16Rms(input.volumeDbfs)
  );

  return await concatPcmToWav([normalized], {
    gapMs: 0,
    targetSampleRate: normalized.sampleRate,
  });
}
