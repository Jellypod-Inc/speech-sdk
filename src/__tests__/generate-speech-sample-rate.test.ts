import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import { createElevenLabs } from "../providers/elevenlabs/index.js";

describe("generateSpeech sampleRate plumbing", () => {
  it("requests pcm at output.sampleRate when output is set", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const u = new URL(url.toString());
      expect(u.searchParams.get("output_format")).toBe("pcm_48000");
      return Promise.resolve(
        new Response(new Uint8Array([0, 0, 0, 0]), {
          headers: { "content-type": "audio/pcm" },
        })
      );
    });

    const eleven = createElevenLabs({
      apiKey: "test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await generateSpeech({
      model: eleven("eleven_multilingual_v2"),
      text: "hi",
      voice: "test-voice",
      output: { format: "pcm", sampleRate: 48_000 },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("defaults to highest provider rate when output.sampleRate is unset", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const u = new URL(url.toString());
      expect(u.searchParams.get("output_format")).toBe("pcm_48000");
      return Promise.resolve(
        new Response(new Uint8Array([0, 0, 0, 0]), {
          headers: { "content-type": "audio/pcm" },
        })
      );
    });

    const eleven = createElevenLabs({
      apiKey: "test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await generateSpeech({
      model: eleven("eleven_multilingual_v2"),
      text: "hi",
      voice: "test-voice",
      output: { format: "pcm" },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses output.sampleRate as the stitch wire rate when volumeDbfs is set", async () => {
    const fetchMock = vi.fn((url: string | URL) => {
      const u = new URL(url.toString());
      expect(u.searchParams.get("output_format")).toBe("pcm_48000");
      return Promise.resolve(
        new Response(new Uint8Array([0, 0, 0, 0]), {
          headers: { "content-type": "audio/pcm" },
        })
      );
    });

    const eleven = createElevenLabs({
      apiKey: "test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    await generateSpeech({
      model: eleven("eleven_multilingual_v2"),
      text: "hi",
      voice: "test-voice",
      output: { format: "wav", sampleRate: 48_000 },
      volumeDbfs: -16,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
