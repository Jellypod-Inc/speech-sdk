/**
 * Build a 44-byte WAV/RIFF header for 16-bit mono PCM audio.
 * If dataSize is unknown (streaming), pass 0xFFFFFFFF — most players
 * will read until EOF.
 */
export function buildWavHeader({
  sampleRate,
  numChannels,
  bitsPerSample,
  dataSize,
}: {
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  dataSize: number;
}): Uint8Array {
  const header = new Uint8Array(44);
  const view = new DataView(header.buffer);
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // "RIFF" chunk descriptor
  header.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, dataSize + 36, true); // chunkSize = dataSize + 36
  header.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"

  // "fmt " subchunk
  header.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true); // subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true); // audioFormat (PCM = 1)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // "data" subchunk
  header.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);

  return header;
}

/**
 * Wrap raw 16-bit mono PCM bytes in a complete WAV container.
 */
export function pcmToWav(
  pcm: Uint8Array,
  sampleRate: number,
  numChannels = 1,
  bitsPerSample = 16
): Uint8Array {
  const header = buildWavHeader({
    sampleRate,
    numChannels,
    bitsPerSample,
    dataSize: pcm.length,
  });
  const wav = new Uint8Array(header.length + pcm.length);
  wav.set(header, 0);
  wav.set(pcm, header.length);
  return wav;
}

// biome-ignore lint/performance/useTopLevelRegex: single-use parser
const RATE_PARAM = /(?:^|;)\s*rate=(\d+)/i;

/**
 * Parse sample rate from a PCM mime type like "audio/L16;codec=pcm;rate=24000".
 * Returns undefined if not found.
 */
export function parseSampleRate(mimeType: string): number | undefined {
  const match = mimeType.match(RATE_PARAM);
  return match ? Number(match[1]) : undefined;
}
