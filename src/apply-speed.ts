import { decodeAudioToPcm16 } from "./audio-decode.js";
import {
  type AudioOutput,
  applyOptionalOutputConversion,
} from "./audio-output.js";
import { wrapPcm16Mono } from "./audio-utils.js";
import { timeStretch } from "./plugins/time-stretch/index.js";

export const SPEED_MIN = 0.75;
export const SPEED_MAX = 1.5;

export function validateSpeed(speed: number | undefined): void {
  if (speed === undefined) {
    return;
  }
  if (typeof speed !== "number" || !Number.isFinite(speed)) {
    throw new TypeError("speed must be a finite number.");
  }
  if (speed < SPEED_MIN || speed > SPEED_MAX) {
    throw new RangeError(
      `speed must be between ${SPEED_MIN} and ${SPEED_MAX}.`
    );
  }
}

export function isSpeedActive(speed: number | undefined): speed is number {
  return speed !== undefined && speed !== 1;
}

export async function applySpeedToAudio(args: {
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly speed: number;
  readonly output: AudioOutput | undefined;
}): Promise<{ readonly audio: Uint8Array; readonly mediaType: string }> {
  const decoded = await decodeAudioToPcm16(args.audio, args.mediaType);
  const stretched = timeStretch(decoded.pcm, {
    speed: args.speed,
    sampleRate: decoded.sampleRate,
  });
  const stretchedBytes = new Uint8Array(
    stretched.buffer,
    stretched.byteOffset,
    stretched.byteLength
  );
  const wav = await wrapPcm16Mono(stretchedBytes, decoded.sampleRate);

  if (args.output) {
    return await applyOptionalOutputConversion({
      audio: wav,
      mediaType: "audio/wav",
      output: args.output,
    });
  }

  return { audio: wav, mediaType: "audio/wav" };
}

export function scaleTimestamps<T extends { start: number; end: number }>(
  timestamps: readonly T[] | undefined,
  speed: number
): T[] | undefined {
  if (!timestamps) {
    return;
  }
  return timestamps.map((t) => ({
    ...t,
    start: t.start / speed,
    end: t.end / speed,
  }));
}
