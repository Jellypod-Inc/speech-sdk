const SUPPORTED_SAMPLE_RATES = new Set([
  16_000, 22_050, 24_000, 32_000, 44_100, 48_000,
]);

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

  const { Mp3Encoder } = await import("@breezystack/lamejs");
  const encoder = new Mp3Encoder(1, sampleRate, bitrateKbps);
  const samples = new Int16Array(
    pcm.buffer,
    pcm.byteOffset,
    Math.floor(pcm.byteLength / 2)
  );

  const chunkSize = 1152;
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < samples.length; i += chunkSize) {
    const encoded = encoder.encodeBuffer(samples.subarray(i, i + chunkSize));
    if (encoded.length > 0) {
      chunks.push(new Uint8Array(encoded));
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    chunks.push(new Uint8Array(tail));
  }

  const totalLength = chunks.reduce((n, chunk) => n + chunk.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
