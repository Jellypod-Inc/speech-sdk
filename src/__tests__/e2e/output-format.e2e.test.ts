import { describe, expect, it } from "vitest";
import { createOpenAI } from "../../providers/openai/index.js";
import { generateConversation, generateSpeech } from "./_save-audio.js";

const TEST_TEXT = "Hello, this is a test of the speech SDK output format.";
const VOICE = "alloy";

const RIFF_MAGIC = [0x52, 0x49, 0x46, 0x46] as const;
const WAVE_MAGIC = [0x57, 0x41, 0x56, 0x45] as const;
const MPEG_FRAME_SYNC_BYTE_2_MASK = 0xe0;

function isRiffWave(bytes: Uint8Array): boolean {
  for (let i = 0; i < 4; i++) {
    if (bytes[i] !== RIFF_MAGIC[i] || bytes[8 + i] !== WAVE_MAGIC[i]) {
      return false;
    }
  }
  return true;
}

function isMpegFrameSync(bytes: Uint8Array): boolean {
  // ID3v2 tag (LAME and many encoders prepend this); the actual MPEG frames follow.
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    return true;
  }
  if (bytes[0] !== 0xff) {
    return false;
  }
  // biome-ignore lint/suspicious/noBitwiseOperators: MPEG frame sync test
  const masked = bytes[1] & MPEG_FRAME_SYNC_BYTE_2_MASK;
  return masked === MPEG_FRAME_SYNC_BYTE_2_MASK;
}

describe("output format e2e (OpenAI direct)", () => {
  it("generateSpeech output: wav returns audio/wav", async () => {
    const result = await generateSpeech({
      model: createOpenAI()("tts-1"),
      voice: VOICE,
      text: TEST_TEXT,
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(isRiffWave(result.audio.uint8Array)).toBe(true);
  });

  it("generateSpeech output: mp3 returns audio/mpeg", async () => {
    const result = await generateSpeech({
      model: createOpenAI()("tts-1"),
      voice: VOICE,
      text: TEST_TEXT,
      output: { format: "mp3" },
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(isMpegFrameSync(result.audio.uint8Array)).toBe(true);
  });

  it("generateSpeech output: mp3 with explicit bitrate returns audio/mpeg", async () => {
    const result = await generateSpeech({
      model: createOpenAI()("tts-1"),
      voice: VOICE,
      text: TEST_TEXT,
      output: { format: "mp3", bitrate: 128 },
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(isMpegFrameSync(result.audio.uint8Array)).toBe(true);
  });

  it("generateSpeech output: pcm returns audio/pcm;rate=24000", async () => {
    const result = await generateSpeech({
      model: createOpenAI()("tts-1"),
      voice: VOICE,
      text: TEST_TEXT,
      output: { format: "pcm" },
    });

    expect(result.audio.mediaType).toBe("audio/pcm;rate=24000");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(result.audio.uint8Array.byteLength % 2).toBe(0);
  });

  it("generateConversation stitch output: mp3 returns audio/mpeg", async () => {
    const result = await generateConversation({
      turns: [
        {
          model: createOpenAI()("tts-1"),
          voice: "alloy",
          text: "Hi there.",
        },
        {
          model: createOpenAI()("tts-1"),
          voice: "echo",
          text: "Hello back!",
        },
      ],
      output: { format: "mp3", bitrate: 96 },
    });

    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
    expect(isMpegFrameSync(result.audio.uint8Array)).toBe(true);
  });

  it("generateConversation stitch output: pcm returns audio/pcm;rate=24000", async () => {
    const result = await generateConversation({
      turns: [
        {
          model: createOpenAI()("tts-1"),
          voice: "alloy",
          text: "First turn.",
        },
        {
          model: createOpenAI()("tts-1"),
          voice: "echo",
          text: "Second turn.",
        },
      ],
      output: { format: "pcm" },
    });

    expect(result.audio.mediaType).toBe("audio/pcm;rate=24000");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });

  it("generateConversation stitch output: wav (default) returns audio/wav", async () => {
    const result = await generateConversation({
      turns: [
        {
          model: createOpenAI()("tts-1"),
          voice: "alloy",
          text: "First.",
        },
        {
          model: createOpenAI()("tts-1"),
          voice: "echo",
          text: "Second.",
        },
      ],
      output: { format: "wav" },
    });

    expect(result.audio.mediaType).toBe("audio/wav");
    expect(isRiffWave(result.audio.uint8Array)).toBe(true);
  });
});
