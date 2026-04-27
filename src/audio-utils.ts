import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Output,
  WavOutputFormat,
} from "mediabunny";

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

export function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
