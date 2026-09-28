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

  // Both takes start together so network conditions are shared and the comparison is fair.
  it("delivers the first chunk before the buffered take finishes", async () => {
    const start = performance.now();
    const bufferedTake = generateConversation({
      model: google("gemini-3.8-flash-tts"),
      turns: TURNS,
    }).then((result) => ({ result, ms: performance.now() - start }));
    const streamedTake = (async () => {
      const { audio, mediaType } = await streamConversation({
        model: google("gemini-3.8-flash-tts"),
        turns: TURNS,
      });
      const reader = audio.getReader();
      const first = await reader.read();
      const firstChunkMs = performance.now() - start;
      let bytes = first.value?.byteLength ?? 0;
      for (
        let next = await reader.read();
        !next.done;
        next = await reader.read()
      ) {
        bytes += next.value.byteLength;
      }
      return {
        bytes,
        firstDone: first.done,
        firstChunkMs,
        mediaType,
        streamedMs: performance.now() - start,
      };
    })();
    const [buffered, streamed] = await Promise.all([
      bufferedTake,
      streamedTake,
    ]);

    // Logged so a live run reports both latencies.
    console.log(
      `[stream-conversation] first chunk ${Math.round(streamed.firstChunkMs)} ms, full stream ${Math.round(streamed.streamedMs)} ms, buffered generateConversation ${Math.round(buffered.ms)} ms, ${streamed.bytes} bytes`
    );
    expect(buffered.result.metadata.path).toBe("native");
    expect(streamed.mediaType).toBe("audio/pcm;rate=24000");
    expect(streamed.firstDone).toBe(false);
    expect(streamed.bytes).toBeGreaterThan(24_000);
    expect(streamed.firstChunkMs).toBeLessThan(buffered.ms);
  }, 180_000);
});
