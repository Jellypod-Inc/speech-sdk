import { describe, expect, it } from "vitest";
import { generateConversation } from "../../generate-conversation.js";
import { maybeSaveAudio } from "./_save-audio.js";

describe("Conversation stitch e2e — OpenAI (no native dialogue)", () => {
  it("stitches 3 OpenAI turns with 2 distinct voices", async () => {
    const result = await generateConversation({
      model: "openai/tts-1",
      turns: [
        { voice: "nova", text: "Hi there, my name is Nova." },
        { voice: "shimmer", text: "And I am Shimmer. Nice to meet you!" },
        { voice: "nova", text: "Likewise!" },
      ],
      gapMs: 300,
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(44);
    expect(result.metadata.audioDurationMs ?? 0).toBeGreaterThan(1000);
    expect(result.metadata.inputChars).toBe(
      "Hi there, my name is Nova.".length +
        "And I am Shimmer. Nice to meet you!".length +
        "Likewise!".length
    );
    expect(result.metadata.provider).toBe("openai");
    expect(result.metadata.model).toBe("tts-1");

    await maybeSaveAudio("conversation-stitch-openai", result.audio);
  });
});
