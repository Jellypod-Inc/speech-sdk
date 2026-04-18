import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";

const ELEVEN_VOICE = process.env.ELEVENLABS_VOICE_ID ?? "JBFqnCBsd6RMkjVDRZzb";

describe("Conversation stitch e2e — cross-provider", () => {
  it("stitches an OpenAI turn and an ElevenLabs turn into one WAV", async () => {
    const result = await generateConversation({
      turns: [
        {
          model: "openai/tts-1",
          voice: "nova",
          text: "Hi, I'm powered by OpenAI.",
        },
        {
          model: "elevenlabs/eleven_multilingual_v2",
          voice: ELEVEN_VOICE,
          text: "And I'm powered by ElevenLabs!",
        },
      ],
      gapMs: 300,
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(44);
    // Mixed-provider metadata is comma-joined.
    expect(result.metadata.provider).toContain("openai");
    expect(result.metadata.provider).toContain("elevenlabs");
  });
});
