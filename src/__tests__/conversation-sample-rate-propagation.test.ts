import { describe, expect, it, vi } from "vitest";
import { generateConversation } from "../generate-conversation.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

const PCM_SAMPLE_RATE = 24_000;

function buildSinePcmBytes(): Uint8Array {
  const pcm = new Int16Array(PCM_SAMPLE_RATE);
  for (let i = 0; i < pcm.length; i++) {
    pcm[i] = Math.round(
      Math.sin((i / PCM_SAMPLE_RATE) * 2 * Math.PI * 440) * 16_000
    );
  }
  return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
}

describe("generateConversation propagates output.sampleRate to per-turn getStitchOptions", () => {
  it("requests pcm_24000 from ElevenLabs when caller asks for pcm @ 24kHz on the stitch path", async () => {
    const audio = buildSinePcmBytes();
    const fetchSpy = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(audio, {
          status: 200,
          headers: { "content-type": `audio/pcm;rate=${PCM_SAMPLE_RATE}` },
        })
      )
    );

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test",
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });

    // eleven_multilingual_v2 has no native dialogue → stitch path.
    await generateConversation({
      model: { provider, modelId: "eleven_multilingual_v2" },
      turns: [
        { voice: "v1", text: "hello" },
        { voice: "v2", text: "world" },
      ],
      output: { format: "pcm", sampleRate: 24_000 },
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const call of fetchSpy.mock.calls) {
      const url = String(call[0]);
      expect(url).toContain("output_format=pcm_24000");
      expect(url).not.toContain("output_format=pcm_48000");
    }
  });
});
