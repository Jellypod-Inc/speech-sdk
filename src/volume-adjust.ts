import { decodeAudioToPcm16 } from "./audio-decode.js";
import { type AudioFilter, applyFiltersToSegment } from "./audio-filters.js";
import { base64ToUint8Array } from "./audio-utils.js";
import {
  concatPcmToWav,
  dbfsToInt16Rms,
  normalizeRms,
} from "./conversation/pcm-concat.js";

interface AdjustVolumeInput {
  readonly audio: string | Uint8Array;
  readonly filters?: readonly AudioFilter[];
  readonly mediaType: string;
  readonly volumeDbfs?: number;
}

// Filters run before RMS normalization: tonal shaping changes level, so
// normalizing afterwards is what makes the volume target hold post-EQ.
export async function adjustVolume(
  input: AdjustVolumeInput
): Promise<Uint8Array> {
  const bytes =
    input.audio instanceof Uint8Array
      ? input.audio
      : base64ToUint8Array(input.audio);

  let segment = await decodeAudioToPcm16(bytes, input.mediaType);
  if (input.filters?.length) {
    segment = applyFiltersToSegment(segment, input.filters);
  }
  const [processed] =
    input.volumeDbfs == null
      ? [segment]
      : normalizeRms([segment], dbfsToInt16Rms(input.volumeDbfs));

  return await concatPcmToWav([processed], {
    gapMs: 0,
    targetSampleRate: processed.sampleRate,
  });
}
