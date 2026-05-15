import {
  ALL_FORMATS,
  AudioSample,
  AudioSampleSink,
  BlobSource,
  Input,
} from "mediabunny";
import { parseMediaTypeParam } from "./audio-utils.js";

export interface DecodedPcm16 {
  readonly channels: 1;
  readonly pcm: Int16Array;
  readonly sampleRate: number;
}

export async function decodeAudioToPcm16(
  bytes: Uint8Array,
  mediaType: string
): Promise<DecodedPcm16> {
  const lower = mediaType.toLowerCase();

  if (lower.startsWith("audio/pcm") || lower.startsWith("audio/x-pcm")) {
    return decodeRawPcm(bytes, mediaType);
  }

  return await decodeContainerized(bytes, mediaType);
}

const ENCODING_PARAM_RE = /(?:^|;)\s*encoding=([a-z0-9_-]+)(?=$|;|\s)/i;

// Bounds defensive buffer sizing — TTS output is mono or stereo in practice; an upstream
// that returns audio/pcm;channels=999999 must not be allowed to drive arithmetic on byte counts.
const MAX_PCM_CHANNELS = 32;

function decodeRawPcm(bytes: Uint8Array, mediaType: string): DecodedPcm16 {
  const sampleRate = parseMediaTypeParam(mediaType, "rate") ?? 24_000;
  const channels = parseMediaTypeParam(mediaType, "channels") ?? 1;
  if (
    !Number.isInteger(channels) ||
    channels < 1 ||
    channels > MAX_PCM_CHANNELS
  ) {
    throw new Error(
      `audio-decode: invalid channels=${channels} (mediaType="${mediaType}"); must be an integer in [1, ${MAX_PCM_CHANNELS}]`
    );
  }
  const encoding = mediaType.toLowerCase().match(ENCODING_PARAM_RE)?.[1];
  const format = encoding === "float32" ? "f32" : "s16";
  const bytesPerSample = format === "f32" ? 4 : 2;

  const numberOfFrames = Math.floor(
    bytes.byteLength / bytesPerSample / channels
  );
  if (numberOfFrames === 0) {
    return { pcm: new Int16Array(0), sampleRate, channels: 1 };
  }

  const data =
    format === "f32"
      ? new Float32Array(
          copyAligned(bytes, 4).buffer,
          0,
          numberOfFrames * channels
        )
      : new Int16Array(
          copyAligned(bytes, 2).buffer,
          0,
          numberOfFrames * channels
        );

  const sample = new AudioSample({
    data,
    format,
    numberOfChannels: channels,
    sampleRate,
    timestamp: 0,
  });

  const monoFrames = sample.numberOfFrames;
  const out = new Int16Array(monoFrames);
  if (channels === 1) {
    sample.copyTo(out, { format: "s16", planeIndex: 0 });
    return { pcm: out, sampleRate, channels: 1 };
  }

  const interleaved = new Int16Array(monoFrames * channels);
  sample.copyTo(interleaved, { format: "s16", planeIndex: 0 });
  for (let f = 0; f < monoFrames; f++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += interleaved[f * channels + c];
    }
    out[f] = Math.round(sum / channels);
  }
  return { pcm: out, sampleRate, channels: 1 };
}

async function decodeContainerized(
  bytes: Uint8Array,
  mediaType: string
): Promise<DecodedPcm16> {
  // .slice() copies into a fresh ArrayBuffer (Blob accepts ArrayBuffer-backed views, not SharedArrayBuffer).
  const blob = new Blob([bytes.slice()], { type: mediaType });
  const input = new Input({
    source: new BlobSource(blob),
    formats: ALL_FORMATS,
  });

  const track = await input.getPrimaryAudioTrack();
  if (!track) {
    throw new Error(
      `audio-decode: no audio track found in input (mediaType="${mediaType}")`
    );
  }

  const sampleRate = track.sampleRate;
  const sourceChannels = track.numberOfChannels;
  const sink = new AudioSampleSink(track);

  const chunks: Int16Array[] = [];
  let totalMonoFrames = 0;
  for await (const sample of sink.samples()) {
    const frames = sample.numberOfFrames;
    if (frames === 0) {
      sample.close();
      continue;
    }
    if (sourceChannels === 1) {
      const buf = new Int16Array(frames);
      sample.copyTo(buf, { format: "s16", planeIndex: 0 });
      chunks.push(buf);
      totalMonoFrames += frames;
    } else {
      const interleaved = new Int16Array(frames * sourceChannels);
      sample.copyTo(interleaved, { format: "s16", planeIndex: 0 });
      const mono = new Int16Array(frames);
      for (let f = 0; f < frames; f++) {
        let sum = 0;
        for (let c = 0; c < sourceChannels; c++) {
          sum += interleaved[f * sourceChannels + c];
        }
        mono[f] = Math.round(sum / sourceChannels);
      }
      chunks.push(mono);
      totalMonoFrames += frames;
    }
    sample.close();
  }

  const pcm = new Int16Array(totalMonoFrames);
  let offset = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, offset);
    offset += chunk.length;
  }
  return { pcm, sampleRate, channels: 1 };
}

function copyAligned(bytes: Uint8Array, alignment: number): Uint8Array {
  if (
    bytes.byteOffset % alignment === 0 &&
    bytes.byteLength % alignment === 0
  ) {
    return bytes;
  }
  const aligned = new Uint8Array(
    bytes.byteLength - (bytes.byteLength % alignment)
  );
  aligned.set(bytes.subarray(0, aligned.length));
  return aligned;
}
