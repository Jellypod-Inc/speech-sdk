import { createSpeechify } from "../../providers/speechify/index.js";
import { streamSpeech } from "../../stream-speech.js";
import { collectStreamAndSave, generateSpeech } from "./_save-audio.js";

const hasKey = !!process.env.SPEECHIFY_API_KEY;

describe.skipIf(!hasKey)("Speechify e2e", () => {
  const TEST_TEXT =
    "Your morning briefing is ready. Revenue is up, support volume is steady, and the launch checklist is on track.";
  const voice = process.env.SPEECHIFY_VOICE_ID ?? "george";

  it("generates audio via direct provider", async () => {
    const speechify = createSpeechify();
    const result = await generateSpeech({
      model: speechify(),
      text: TEST_TEXT,
      voice,
    });

    expect(result.audio.uint8Array.length).toBeGreaterThan(1000);
    expect(result.audio.mediaType).toBe("audio/wav");
  });

  it("streams audio via streamSpeech", async () => {
    const result = await streamSpeech({
      model: createSpeechify()(),
      text: TEST_TEXT,
      voice,
    });

    expect(result.mediaType).toBe("audio/mpeg");
    await collectStreamAndSave(result, "speechify-stream.mp3");
  });

  it("streams audio from simba-3.0", async () => {
    const result = await streamSpeech({
      model: createSpeechify()("simba-3.0"),
      text: TEST_TEXT,
      voice,
    });

    expect(result.mediaType).toBe("audio/mpeg");
    await collectStreamAndSave(result, "speechify-simba-3.0-stream.mp3");
  });

  it("supports explicit PCM output", async () => {
    const result = await generateSpeech({
      model: createSpeechify()(),
      text: TEST_TEXT,
      voice,
      output: { format: "pcm", sampleRate: 48_000 },
    });

    expect(result.audio.mediaType).toBe("audio/pcm;rate=48000");
    expect(result.audio.uint8Array.length).toBeGreaterThan(1000);
  });
});
