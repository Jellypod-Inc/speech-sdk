import { describe, expect, it } from "vitest";
import { encodePcm16ToMp3 } from "../encoders/mp3.js";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider } from "../speech-provider.js";

interface MockOutcome {
  generatedBytes: Uint8Array;
  generatedMediaType: string;
  resolvedFormat?: {
    providerOptions: Record<string, unknown>;
    expectedMediaType: string;
  };
}

function makeMockProvider(opts: MockOutcome): {
  provider: SpeechProvider;
  callCapture: { providerOptions?: Record<string, unknown> };
} {
  const callCapture: { providerOptions?: Record<string, unknown> } = {};
  const provider: SpeechProvider = {
    id: "mock",
    defaultModel: "mock-1",
    models: [
      {
        id: "mock-1",
        releaseDate: "2026-01-01",
        languages: ["en"],
        features: [],
      },
    ],
    resolveOutputFormat: opts.resolvedFormat
      ? () => opts.resolvedFormat
      : undefined,
    generate(options) {
      callCapture.providerOptions = options.providerOptions;
      return Promise.resolve({
        audio: opts.generatedBytes,
        mediaType: opts.generatedMediaType,
      });
    },
  };
  return { provider, callCapture };
}

describe("generateSpeech native output pass-through", () => {
  it("uses provider-native mp3 and skips local re-encoding", async () => {
    const samples = new Int16Array(2400).fill(1000);
    const pcmBytes = new Uint8Array(samples.buffer);
    const fakeMp3 = await encodePcm16ToMp3({
      pcm: pcmBytes,
      sampleRate: 24_000,
      bitrateKbps: 96,
    });

    const { provider, callCapture } = makeMockProvider({
      resolvedFormat: {
        providerOptions: { response_format: "mp3" },
        expectedMediaType: "audio/mpeg",
      },
      generatedMediaType: "audio/mpeg",
      generatedBytes: fakeMp3,
    });

    const result = await generateSpeech({
      model: { provider, modelId: "mock-1" },
      text: "hi",
      voice: "test",
      output: { format: "mp3" },
    });

    expect(callCapture.providerOptions).toMatchObject({
      response_format: "mp3",
    });
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.audio.uint8Array.byteLength).toBe(fakeMp3.byteLength);
    expect(Array.from(result.audio.uint8Array.subarray(0, 4))).toEqual(
      Array.from(fakeMp3.subarray(0, 4))
    );
  });

  it("falls back to provider-native pcm and SDK wraps to wav when user wants wav", async () => {
    const samples = new Int16Array(2400).fill(1000);
    const pcmBytes = new Uint8Array(samples.buffer);
    const { provider, callCapture } = makeMockProvider({
      resolvedFormat: {
        providerOptions: { output_format: "pcm_24000" },
        expectedMediaType: "audio/pcm;rate=24000",
      },
      generatedMediaType: "audio/pcm;rate=24000",
      generatedBytes: pcmBytes,
    });

    const result = await generateSpeech({
      model: { provider, modelId: "mock-1" },
      text: "hi",
      voice: "test",
      output: { format: "wav" },
    });

    expect(callCapture.providerOptions).toMatchObject({
      output_format: "pcm_24000",
    });
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.audio.uint8Array[0]).toBe("R".charCodeAt(0));
    expect(result.audio.uint8Array[1]).toBe("I".charCodeAt(0));
    expect(result.audio.uint8Array[2]).toBe("F".charCodeAt(0));
    expect(result.audio.uint8Array[3]).toBe("F".charCodeAt(0));
  });

  it("encodes mp3 via mediabunny when provider returns pcm and user wants mp3", async () => {
    const samples = new Int16Array(24_000);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.round(
        Math.sin((i / 24_000) * 2 * Math.PI * 440) * 16_000
      );
    }
    const pcmBytes = new Uint8Array(samples.buffer);
    const { provider, callCapture } = makeMockProvider({
      resolvedFormat: {
        providerOptions: { output_format: "pcm_24000" },
        expectedMediaType: "audio/pcm;rate=24000",
      },
      generatedMediaType: "audio/pcm;rate=24000",
      generatedBytes: pcmBytes,
    });

    const result = await generateSpeech({
      model: { provider, modelId: "mock-1" },
      text: "hi",
      voice: "test",
      output: { format: "mp3" },
    });

    expect(callCapture.providerOptions).toMatchObject({
      output_format: "pcm_24000",
    });
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.audio.uint8Array[0]).toBe(0xff);
    // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync mask
    expect(result.audio.uint8Array[1] & 0xe0).toBe(0xe0);
  });
});
