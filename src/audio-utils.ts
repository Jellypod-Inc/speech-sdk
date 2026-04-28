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
  const blob = new Blob([sourceWav.slice()], { type: "audio/wav" });

  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });
  // Output is required by Conversion.init; we drop samples in `process` so
  // no encode happens — the buffer stays empty and we never read it.
  const output = new Output({
    format: new WavOutputFormat(),
    target: new BufferTarget(),
  });

  const captured: Int16Array[] = [];
  let totalFrames = 0;
  const conversion = await Conversion.init({
    input,
    output,
    audio: {
      sampleRate: toRate,
      numberOfChannels: 1,
      // WaveMuxer asserts on empty output, so samples pass through to the encoder;
      // we capture s16 here to skip decoding the output WAV.
      process: (sample) => {
        const buf = new Int16Array(sample.numberOfFrames);
        sample.copyTo(buf, { format: "s16", planeIndex: 0 });
        captured.push(buf);
        totalFrames += buf.length;
        return sample;
      },
    },
    showWarnings: false,
  });
  await conversion.execute();

  const out = new Int16Array(totalFrames);
  let offset = 0;
  for (const chunk of captured) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

// Chunked to avoid call-stack overflow on large payloads (~32k arg limit).
const BASE64_CHUNK = 0x80_00;

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK) {
    s += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + BASE64_CHUNK))
    );
  }
  return btoa(s);
}

export function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
