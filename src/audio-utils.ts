import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacket,
  Input,
  Output,
  WavOutputFormat,
} from "mediabunny";
import { decodeAudioToPcm16 } from "./audio-decode.js";

const PARAM_REGEX_CACHE = new Map<string, RegExp>();

export function parseMediaTypeParam(
  mediaType: string,
  name: string
): number | undefined {
  let re = PARAM_REGEX_CACHE.get(name);
  if (!re) {
    // End boundary rejects values like "rate=24000x".
    re = new RegExp(`(?:^|;)\\s*${name}=(\\d+)(?=$|;|\\s)`, "i");
    PARAM_REGEX_CACHE.set(name, re);
  }
  const match = mediaType.match(re);
  if (!match) {
    return;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function wrapPcm16Mono(
  pcm: Uint8Array,
  sampleRate: number
): Promise<Uint8Array> {
  const output = new Output({
    format: new WavOutputFormat(),
    target: new BufferTarget(),
  });
  const source = new EncodedAudioPacketSource("pcm-s16");
  output.addAudioTrack(source);
  await output.start();

  const numSamples = pcm.length / 2;
  const durationSeconds = numSamples / sampleRate;
  const packet = new EncodedPacket(pcm, "key", 0, durationSeconds, 0);
  await source.add(packet, {
    decoderConfig: {
      codec: "pcm-s16",
      numberOfChannels: 1,
      sampleRate,
    },
  });

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("audio-utils: WavOutputFormat produced no buffer");
  }
  return new Uint8Array(buffer);
}

export async function resamplePcm16(
  pcm: Int16Array,
  fromRate: number,
  toRate: number
): Promise<Int16Array> {
  if (fromRate === toRate || pcm.length === 0) {
    return pcm;
  }

  const sourceWav = await wrapPcm16Mono(
    new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    fromRate
  );
  const ab = new ArrayBuffer(sourceWav.byteLength);
  new Uint8Array(ab).set(sourceWav);
  const blob = new Blob([ab], { type: "audio/wav" });

  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  const output = new Output({
    format: new WavOutputFormat(),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({
    input,
    output,
    audio: { sampleRate: toRate, numberOfChannels: 1 },
    showWarnings: false,
  });
  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("audio-utils.resamplePcm16: conversion produced no buffer");
  }
  const resampled = await decodeAudioToPcm16(
    new Uint8Array(buffer),
    "audio/wav"
  );
  return resampled.pcm;
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
