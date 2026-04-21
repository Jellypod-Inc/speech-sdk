import { describe, expect, it, vi } from "vitest";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

// Minimal base64 of a 4-byte Uint8Array so the provider accepts the payload.
const FOUR_BYTES_B64 = "AAECAw=="; // [0, 1, 2, 3]

function mockFetchReturningTimestampedJson(): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        audio_base64: FOUR_BYTES_B64,
        alignment: {
          characters: ["H", "i"],
          character_start_times_seconds: [0, 0.05],
          character_end_times_seconds: [0.05, 0.1],
        },
        normalized_alignment: {
          characters: ["H", "i"],
          character_start_times_seconds: [0, 0.05],
          character_end_times_seconds: [0.05, 0.1],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

describe("ElevenLabs /with-timestamps mediaType derivation", () => {
  it("returns audio/mpeg when no output_format is set (endpoint default)", async () => {
    const fetchFn = mockFetchReturningTimestampedJson();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
    });
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("returns audio/pcm;rate=24000 when output_format is pcm_24000 (stitch-mode case)", async () => {
    const fetchFn = mockFetchReturningTimestampedJson();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
      providerOptions: { output_format: "pcm_24000" },
    });
    expect(result.mediaType).toBe("audio/pcm;rate=24000");
  });

  it("maps mp3_44100_128 to audio/mpeg", async () => {
    const fetchFn = mockFetchReturningTimestampedJson();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
      providerOptions: { output_format: "mp3_44100_128" },
    });
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("maps opus_48000_32 to audio/opus", async () => {
    const fetchFn = mockFetchReturningTimestampedJson();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
      providerOptions: { output_format: "opus_48000_32" },
    });
    expect(result.mediaType).toBe("audio/opus");
  });

  it("maps ulaw_8000 to audio/basic;rate=8000", async () => {
    const fetchFn = mockFetchReturningTimestampedJson();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });
    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Hi",
      voice: "v",
      includeTimestamps: true,
      providerOptions: { output_format: "ulaw_8000" },
    });
    expect(result.mediaType).toBe("audio/basic;rate=8000");
  });
});
