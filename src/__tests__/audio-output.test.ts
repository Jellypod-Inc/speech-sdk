import { describe, expect, it } from "vitest";
import {
  convertDecodableAudioToOutput,
  DEFAULT_MP3_BITRATE_KBPS,
  mediaTypeForOutput,
  resolveOutputForLocalConversion,
  validateOutput,
} from "../audio-output.js";
import { wrapPcm16Mono } from "../audio-utils.js";
import { encodePcm16ToMp3 } from "../encoders/mp3.js";
import { AudioOutputInputError } from "../errors.js";

const MPEG_FRAME_SYNC_BYTE_2_MASK = 0xe0;

function makePcm16Bytes(numSamples: number): Uint8Array {
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.round(
      Math.sin((i / 24_000) * 2 * Math.PI * 440) * 16_000
    );
  }
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

describe("audio-output", () => {
  it("leaves omitted output undefined for gateway wire compatibility", () => {
    expect(validateOutput(undefined)).toBeUndefined();
  });

  it("normalizes mp3 bitrate for local conversion only", () => {
    expect(resolveOutputForLocalConversion({ format: "mp3" })).toEqual({
      format: "mp3",
      bitrate: DEFAULT_MP3_BITRATE_KBPS,
    });
  });

  it("preserves explicit mp3 bitrate", () => {
    expect(
      resolveOutputForLocalConversion({ format: "mp3", bitrate: 128 })
    ).toEqual({
      format: "mp3",
      bitrate: 128,
    });
  });

  it("rejects bitrate on non-mp3 formats", () => {
    expect(() =>
      validateOutput({ format: "wav", bitrate: 128 } as never)
    ).toThrow(AudioOutputInputError);
  });

  it("maps output formats to media types", () => {
    expect(mediaTypeForOutput({ format: "wav" })).toBe("audio/wav");
    expect(mediaTypeForOutput({ format: "mp3", bitrate: 96 })).toBe(
      "audio/mpeg"
    );
    expect(mediaTypeForOutput({ format: "pcm", sampleRate: 24_000 })).toBe(
      "audio/pcm;rate=24000"
    );
  });
});

describe("convertDecodableAudioToOutput", () => {
  it("returns wav input untouched when output format is wav", async () => {
    const pcm = makePcm16Bytes(2400);
    const wav = await wrapPcm16Mono(pcm, 24_000);

    const result = await convertDecodableAudioToOutput({
      audio: wav,
      mediaType: "audio/wav",
      output: { format: "wav" },
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio.byteLength).toBe(wav.byteLength);
    expect(result.audio[0]).toBe("R".charCodeAt(0));
    expect(result.audio[1]).toBe("I".charCodeAt(0));
    expect(result.audio[2]).toBe("F".charCodeAt(0));
    expect(result.audio[3]).toBe("F".charCodeAt(0));
  });

  it("wraps pcm input as RIFF/WAVE when output format is wav", async () => {
    const pcm = makePcm16Bytes(2400);

    const result = await convertDecodableAudioToOutput({
      audio: pcm,
      mediaType: "audio/pcm;rate=24000",
      output: { format: "wav" },
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio[0]).toBe("R".charCodeAt(0));
    expect(result.audio[1]).toBe("I".charCodeAt(0));
    expect(result.audio[2]).toBe("F".charCodeAt(0));
    expect(result.audio[3]).toBe("F".charCodeAt(0));
    expect(result.audio[8]).toBe("W".charCodeAt(0));
    expect(result.audio[9]).toBe("A".charCodeAt(0));
    expect(result.audio[10]).toBe("V".charCodeAt(0));
    expect(result.audio[11]).toBe("E".charCodeAt(0));
  });

  it("returns raw pcm with rate-tagged media type for wav input → pcm output", async () => {
    const pcm = makePcm16Bytes(1200);
    const wav = await wrapPcm16Mono(pcm, 24_000);

    const result = await convertDecodableAudioToOutput({
      audio: wav,
      mediaType: "audio/wav",
      output: { format: "pcm" },
    });

    expect(result.mediaType).toBe("audio/pcm;rate=24000");
    expect(result.audio.byteLength).toBe(pcm.byteLength);
    expect(Array.from(result.audio.subarray(0, 16))).toEqual(
      Array.from(pcm.subarray(0, 16))
    );
  });

  it("encodes pcm input to audio/mpeg when output format is mp3", async () => {
    const pcm = makePcm16Bytes(24_000);

    const result = await convertDecodableAudioToOutput({
      audio: pcm,
      mediaType: "audio/pcm;rate=24000",
      output: { format: "mp3", bitrate: DEFAULT_MP3_BITRATE_KBPS },
    });

    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.audio.byteLength).toBeGreaterThan(0);
    // MPEG frame sync: first byte 0xFF, second byte top 3 bits set (0xE0).
    expect(result.audio[0]).toBe(0xff);
    // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync needs bitmask check
    expect(result.audio[1] & MPEG_FRAME_SYNC_BYTE_2_MASK).toBe(
      MPEG_FRAME_SYNC_BYTE_2_MASK
    );
  });

  it("rejects unsupported source media types", async () => {
    await expect(
      convertDecodableAudioToOutput({
        audio: new Uint8Array([1, 2, 3, 4]),
        mediaType: "audio/mpeg",
        output: { format: "wav" },
      })
    ).rejects.toThrow(AudioOutputInputError);
  });

  it("passes pcm input through when output format is pcm", async () => {
    const pcm = makePcm16Bytes(2400);
    const result = await convertDecodableAudioToOutput({
      audio: pcm,
      mediaType: "audio/pcm;rate=24000",
      output: { format: "pcm" },
    });

    expect(result.mediaType).toBe("audio/pcm;rate=24000");
    expect(result.audio).toBe(pcm);
  });

  it("passes mp3 input through when output format is mp3", async () => {
    const pcm = makePcm16Bytes(24_000);
    const mp3 = await encodePcm16ToMp3({
      pcm,
      sampleRate: 24_000,
      bitrateKbps: DEFAULT_MP3_BITRATE_KBPS,
    });
    const result = await convertDecodableAudioToOutput({
      audio: mp3,
      mediaType: "audio/mpeg",
      output: { format: "mp3", bitrate: DEFAULT_MP3_BITRATE_KBPS },
    });

    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.audio).toBe(mp3);
  });
});
