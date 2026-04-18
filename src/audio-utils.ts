import {
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  Output,
  WavOutputFormat,
} from "mediabunny";

const PARAM_REGEX_CACHE = new Map<string, RegExp>();

/**
 * Parse a numeric parameter from a mediaType string (e.g. "audio/pcm;rate=24000").
 * Returns undefined if missing or non-positive.
 */
export function parseMediaTypeParam(
  mediaType: string,
  name: string
): number | undefined {
  let re = PARAM_REGEX_CACHE.get(name);
  if (!re) {
    re = new RegExp(`(?:^|;)\\s*${name}=(\\d+)`, "i");
    PARAM_REGEX_CACHE.set(name, re);
  }
  const match = mediaType.match(re);
  if (!match) {
    return undefined;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

/**
 * Wrap raw 16-bit little-endian mono PCM bytes in a WAV container.
 * Cross-platform (browser, Node, edge) via mediabunny's container ops —
 * does not require the WebCodecs encoder.
 */
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

  // 2 bytes per sample, mono.
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
