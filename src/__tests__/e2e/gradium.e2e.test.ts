import { createGradium } from "../../providers/gradium/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.GRADIUM_API_KEY;

describe.skipIf(!hasKey)("Gradium e2e", () => {
  const TEST_TEXT =
    "Your morning briefing is ready. Revenue is up, support volume is steady, and the launch checklist is on track.";
  const voice = process.env.GRADIUM_VOICE_ID ?? "cLONiZ4hQ8VpQ4Sz";

  it("generates audio via direct provider", async () => {
    const gradium = createGradium();
    const result = await generateSpeech({
      model: gradium(),
      text: TEST_TEXT,
      voice,
    });

    expect(result.audio.uint8Array.length).toBeGreaterThan(1000);
    expect(result.audio.mediaType).toBe("audio/wav");
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: createGradium()(),
      text: TEST_TEXT,
      voice,
    });

    expect(result.mediaType).toBe("audio/wav");
    await collectStreamAndSave(result, "gradium-stream.wav");
  });

  it("supports explicit PCM output", async () => {
    const result = await generateSpeech({
      model: createGradium()(),
      text: TEST_TEXT,
      voice,
      output: { format: "pcm", sampleRate: 24_000 },
    });

    expect(result.audio.mediaType).toBe("audio/pcm;rate=24000");
    expect(result.audio.uint8Array.length).toBeGreaterThan(1000);
  });
});
