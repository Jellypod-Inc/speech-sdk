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

describe("ElevenLabs /with-timestamps", () => {
  it("uses original alignment when normalized text expands the input", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audio_base64: FOUR_BYTES_B64,
          alignment: {
            characters: [..."Dr. 12"],
            character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25],
            character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
          },
          normalized_alignment: {
            characters: [..."Doctor twelve"],
            character_start_times_seconds: [
              0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55,
              0.6,
            ],
            character_end_times_seconds: [
              0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6,
              0.65,
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "eleven_multilingual_v2",
      text: "Dr. 12",
      voice: "v",
      includeTimestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Dr.", start: 0, end: 0.15 },
      { text: "12", start: 0.2, end: 0.3 },
    ]);
  });

  it("uses normalized alignment when original alignment contains audio tags", async () => {
    const original = [..."[laughs] Hello"];
    const normalized = [..."Hello"];
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audio_base64: FOUR_BYTES_B64,
          alignment: {
            characters: original,
            character_start_times_seconds: original.map(
              (_, index) => index * 0.05
            ),
            character_end_times_seconds: original.map(
              (_, index) => (index + 1) * 0.05
            ),
          },
          normalized_alignment: {
            characters: normalized,
            character_start_times_seconds: normalized.map(
              (_, index) => 0.45 + index * 0.05
            ),
            character_end_times_seconds: normalized.map(
              (_, index) => 0.5 + index * 0.05
            ),
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "k",
      fetch: fetchFn as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "eleven_v3",
      text: "[laughs] Hello",
      voice: "v",
      includeTimestamps: true,
    });

    expect(result.timestamps).toEqual([
      { text: "Hello", start: 0.45, end: 0.7 },
    ]);
  });

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
