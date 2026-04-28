import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  canEncodeAudio,
  Mp3OutputFormat,
  Output,
} from "mediabunny";

const SUPPORTED_SAMPLE_RATES = new Set([
  16_000, 22_050, 24_000, 32_000, 44_100, 48_000,
]);

let mp3EncoderRegistered: Promise<void> | undefined;

async function ensureMp3Encoder(): Promise<void> {
  if (!mp3EncoderRegistered) {
    mp3EncoderRegistered = (async () => {
      if (await canEncodeAudio("mp3")) {
        return;
      }
      const { registerMp3Encoder } = await import("@mediabunny/mp3-encoder");
      registerMp3Encoder();
    })();
  }
  await mp3EncoderRegistered;
}

export async function encodePcm16ToMp3(args: {
  readonly pcm: Uint8Array;
  readonly sampleRate: number;
  readonly bitrateKbps: number;
}): Promise<Uint8Array> {
  const { pcm, sampleRate, bitrateKbps } = args;

  if (pcm.byteLength === 0) {
    throw new Error("encodePcm16ToMp3: input pcm is empty");
  }
  if (!SUPPORTED_SAMPLE_RATES.has(sampleRate)) {
    throw new Error(`encodePcm16ToMp3: unsupported sample rate ${sampleRate}`);
  }

  await ensureMp3Encoder();

  const output = new Output({
    format: new Mp3OutputFormat(),
    target: new BufferTarget(),
  });
  const source = new AudioSampleSource({
    codec: "mp3",
    bitrate: bitrateKbps * 1000,
  });
  output.addAudioTrack(source);
  await output.start();

  const numberOfFrames = Math.floor(pcm.byteLength / 2);
  const sample = new AudioSample({
    data: new Int16Array(pcm.buffer, pcm.byteOffset, numberOfFrames),
    format: "s16",
    numberOfChannels: 1,
    sampleRate,
    timestamp: 0,
  });
  await source.add(sample);
  source.close();

  await output.finalize();
  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("encodePcm16ToMp3: Mp3OutputFormat produced no buffer");
  }
  return new Uint8Array(buffer);
}
