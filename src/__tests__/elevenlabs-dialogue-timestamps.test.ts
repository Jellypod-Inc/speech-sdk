import { describe, expect, it, vi } from "vitest";
import { generateConversation } from "../generate-conversation.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

const SAMPLE_RATE = 48_000;
const DIALOGUE_TEXT = "Hi there.Hey you.";
const CHAR_SECONDS = 0.05;

function pcmBase64(seconds: number): string {
  const pcm = new Int16Array(Math.round(SAMPLE_RATE * seconds));
  return Buffer.from(pcm.buffer).toString("base64");
}

function alignmentFor(text: string) {
  const characters = [...text];
  return {
    characters,
    character_start_times_seconds: characters.map((_, i) => i * CHAR_SECONDS),
    character_end_times_seconds: characters.map(
      (_, i) => (i + 1) * CHAR_SECONDS
    ),
  };
}

// Turns arrive back to back in the alignment with no separator; voice_segments mark where each starts.
function dialogueWithTimestampsResponse(): Response {
  return new Response(
    JSON.stringify({
      audio_base64: pcmBase64(DIALOGUE_TEXT.length * CHAR_SECONDS),
      alignment: alignmentFor(DIALOGUE_TEXT),
      normalized_alignment: alignmentFor(DIALOGUE_TEXT),
      voice_segments: [
        {
          voice_id: "a",
          start_time_seconds: 0,
          end_time_seconds: 0.45,
          character_start_index: 0,
          character_end_index: 9,
          dialogue_input_index: 0,
        },
        {
          voice_id: "b",
          start_time_seconds: 0.45,
          end_time_seconds: 0.85,
          character_start_index: 9,
          character_end_index: 17,
          dialogue_input_index: 1,
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

describe("ElevenLabs native dialogue timestamps", () => {
  it.each([
    "eleven_v4",
    "eleven_v3",
  ])("returns per-turn timestamps from /v1/text-to-dialogue/with-timestamps for %s", async (modelId) => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(dialogueWithTimestampsResponse());
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test",
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });

    const result = await generateConversation({
      model: { provider, modelId },
      turns: [
        { voice: "a", text: "Hi there." },
        { voice: "b", text: "Hey you." },
      ],
      timestamps: true,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/v1/text-to-dialogue/with-timestamps");
    expect(JSON.parse(init.body).model_id).toBe(modelId);
    expect(result.metadata.path).toBe("native");
    expect(result.timestamps.map((w) => [w.text, w.turnIndex])).toEqual([
      ["Hi", 0],
      ["there.", 0],
      ["Hey", 1],
      ["you.", 1],
    ]);
    expect(result.timestamps[2]?.start).toBeCloseTo(9 * CHAR_SECONDS);
  });

  it("keeps using /v1/text-to-dialogue when timestamps are off", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(Buffer.from(pcmBase64(0.5), "base64"), {
        status: 200,
        headers: { "content-type": "audio/pcm" },
      })
    );
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "test",
      fetch: fetchSpy as unknown as typeof globalThis.fetch,
    });

    await generateConversation({
      model: { provider, modelId: "eleven_v4" },
      turns: [
        { voice: "a", text: "Hi there." },
        { voice: "b", text: "Hey you." },
      ],
    });

    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain("/v1/text-to-dialogue");
    expect(url).not.toContain("with-timestamps");
  });
});
