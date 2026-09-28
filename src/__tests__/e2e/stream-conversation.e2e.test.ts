import { describe, expect, it } from "vitest";
import { createGoogle } from "../../providers/google/index.js";
import { streamConversation } from "../../stream-conversation.js";
import { generateConversation } from "./_save-audio.js";

const TURNS = [
  { text: "Did you see the results?", voice: "Kore" },
  { text: "[laughs] I did.", voice: "Puck", instructions: "dry and amused" },
  {
    text: "Honestly, I didn't expect the numbers to hold up this well.",
    voice: "Kore",
  },
  { text: "Neither did I. Let's walk through them.", voice: "Puck" },
] as const;

describe("Gemini 3.8 streamed dialogue e2e", () => {
  const google = createGoogle();

  it("delivers the first chunk before the buffered take finishes", async () => {
    const bufferedStart = performance.now();
    const buffered = await generateConversation({
      model: google("gemini-3.8-flash-tts"),
      turns: TURNS,
    });
    const bufferedMs = performance.now() - bufferedStart;
    expect(buffered.metadata.path).toBe("native");

    const streamStart = performance.now();
    const { audio, mediaType } = await streamConversation({
      model: google("gemini-3.8-flash-tts"),
      turns: TURNS,
    });
    const reader = audio.getReader();
    const first = await reader.read();
    const firstChunkMs = performance.now() - streamStart;
    let bytes = first.value?.byteLength ?? 0;
    for (
      let next = await reader.read();
      !next.done;
      next = await reader.read()
    ) {
      bytes += next.value.byteLength;
    }
    const streamedMs = performance.now() - streamStart;

    // Logged so a live run reports both latencies.
    console.log(
      `[stream-conversation] first chunk ${Math.round(firstChunkMs)} ms, full stream ${Math.round(streamedMs)} ms, buffered generateConversation ${Math.round(bufferedMs)} ms, ${bytes} bytes`
    );
    expect(mediaType).toBe("audio/pcm;rate=24000");
    expect(first.done).toBe(false);
    expect(bytes).toBeGreaterThan(24_000);
    expect(firstChunkMs).toBeLessThan(bufferedMs);
  });
});
