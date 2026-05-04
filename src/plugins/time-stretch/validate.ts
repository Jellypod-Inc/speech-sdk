import type { TimeStretchOptions } from "./index.js";

export interface ValidatedTimeStretchOptions {
  sampleRate: number;
  speed: number;
}

export function validateOptions(
  options: TimeStretchOptions
): ValidatedTimeStretchOptions {
  if (options === null || typeof options !== "object") {
    throw new TypeError("Expected options with speed and sampleRate.");
  }

  const { speed, sampleRate } = options as Partial<TimeStretchOptions>;

  if (typeof speed !== "number" || !Number.isFinite(speed)) {
    throw new TypeError("Expected speed to be a finite number.");
  }

  if (speed < 0.75 || speed > 1.5) {
    throw new RangeError("Expected speed to be between 0.75 and 1.5.");
  }

  if (typeof sampleRate !== "number" || !Number.isFinite(sampleRate)) {
    throw new TypeError("Expected sampleRate to be a finite number.");
  }

  if (!Number.isInteger(sampleRate)) {
    throw new TypeError("Expected sampleRate to be an integer.");
  }

  if (sampleRate < 8000 || sampleRate > 48_000) {
    throw new RangeError("Expected sampleRate to be between 8000 and 48000.");
  }

  return { speed, sampleRate };
}

export function assertSupportedInput(
  input: unknown
): asserts input is Int16Array | Uint8Array | ArrayBuffer {
  if (
    input instanceof Int16Array ||
    input instanceof Uint8Array ||
    input instanceof ArrayBuffer
  ) {
    return;
  }

  throw new TypeError(
    "Expected mono Int16Array PCM, raw s16le Uint8Array, or raw s16le ArrayBuffer."
  );
}

export function assertValidByteInput(bytes: Uint8Array): void {
  if (bytes.byteLength % 2 !== 0) {
    throw new TypeError(
      "Expected raw s16le PCM byte input to have an even byte length."
    );
  }

  const signature = detectEncodedAudioSignature(bytes);
  if (signature !== null) {
    throw new TypeError(
      `${signature} input is not supported. Decode audio files to raw mono s16le PCM before calling timeStretch.`
    );
  }
}

function detectEncodedAudioSignature(bytes: Uint8Array): string | null {
  if (
    bytes.byteLength >= 12 &&
    hasAscii(bytes, 0, "RIFF") &&
    hasAscii(bytes, 8, "WAVE")
  ) {
    return "WAV/RIFF";
  }

  if (bytes.byteLength >= 3 && hasAscii(bytes, 0, "ID3")) {
    return "MP3";
  }

  if (
    bytes.byteLength >= 4 &&
    looksLikeMpegFrameHeader(bytes, 0) &&
    hasAnotherMpegFrameSync(bytes)
  ) {
    return "MP3";
  }

  if (bytes.byteLength >= 4 && hasAscii(bytes, 0, "OggS")) {
    return "Ogg";
  }

  if (bytes.byteLength >= 4 && hasAscii(bytes, 0, "fLaC")) {
    return "FLAC";
  }

  if (bytes.byteLength >= 8 && hasAscii(bytes, 4, "ftyp")) {
    return "MP4/M4A";
  }

  return null;
}

function hasAscii(bytes: Uint8Array, offset: number, value: string): boolean {
  if (offset + value.length > bytes.byteLength) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) {
      return false;
    }
  }

  return true;
}

function hasAnotherMpegFrameSync(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.byteLength - 1, 4096);

  for (let offset = 2; offset < limit; offset += 1) {
    if (looksLikeMpegFrameHeader(bytes, offset)) {
      return true;
    }
  }

  return false;
}

function looksLikeMpegFrameHeader(bytes: Uint8Array, offset: number): boolean {
  if (offset + 1 >= bytes.byteLength) {
    return false;
  }

  return (
    (bytes[offset] ?? 0) === 0xff &&
    // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync needs bitmask check
    ((bytes[offset + 1] ?? 0) & 0xe0) === 0xe0
  );
}
