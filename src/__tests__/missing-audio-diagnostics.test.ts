import { describe, expect, it, vi } from "vitest";
import { NoSpeechGeneratedError } from "../errors.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

// base64 of 4 bytes of 16-bit PCM (2 samples of silence)
const PCM_BASE64 = "AAAAAA==";

function googleProvider(data: unknown) {
  return new GoogleSpeechProvider({
    apiKey: "test-key",
    fetch: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => data,
    }),
  });
}

describe("Google no-audio diagnostics", () => {
  it("surfaces finishReason when the candidate carries no audio", async () => {
    const provider = googleProvider({
      candidates: [{ finishReason: "SAFETY", content: { parts: [] } }],
    });

    await expect(
      provider.generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yes",
        voice: "Kore",
      })
    ).rejects.toThrow("finishReason: SAFETY");
  });

  it("surfaces the text part the model answered with instead of audio", async () => {
    const provider = googleProvider({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [{ text: "Sure, what would you like me to say?" }],
          },
        },
      ],
    });

    await expect(
      provider.generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yes",
        voice: "Kore",
      })
    ).rejects.toThrow('text response: "Sure, what would you like me to say?"');
  });

  it("truncates a long text part", async () => {
    const provider = googleProvider({
      candidates: [{ content: { parts: [{ text: "a".repeat(500) }] } }],
    });

    const error = await provider
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yes",
        voice: "Kore",
      })
      .catch((e: unknown) => e as Error);

    expect(error.message).toContain(`"${"a".repeat(200)}…"`);
    expect(error.message).not.toContain("a".repeat(201));
  });

  it("reports a prompt-level block with no candidates", async () => {
    const provider = googleProvider({
      candidates: [],
      promptFeedback: { blockReason: "OTHER" },
    });

    const error = await provider
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yes",
        voice: "Kore",
      })
      .catch((e: unknown) => e as Error);

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.message).toContain("blockReason: OTHER");
    expect(error.message).toContain("no candidates");
    expect(error.message).toContain("google/gemini-3.1-flash-tts-preview");
  });

  it("still returns audio when a text part precedes the inlineData part", async () => {
    const provider = googleProvider({
      candidates: [
        {
          finishReason: "STOP",
          content: {
            parts: [
              { text: "Reading that aloud now." },
              {
                inlineData: {
                  mimeType: "audio/L16;codec=pcm;rate=24000",
                  data: PCM_BASE64,
                },
              },
            ],
          },
        },
      ],
    });

    const result = await provider.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Yes",
      voice: "Kore",
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio.length).toBeGreaterThan(0);
  });

  it("surfaces the same diagnostics on the dialogue path", async () => {
    const provider = googleProvider({
      candidates: [
        {
          finishReason: "MAX_TOKENS",
          content: { parts: [{ text: "I can't voice that." }] },
        },
      ],
    });

    const error = await provider
      .generateDialogue({
        modelId: "gemini-2.5-flash-preview-tts",
        turns: [
          { voice: "Kore", text: "Yes" },
          { voice: "Puck", text: "No" },
        ],
      })
      .catch((e: unknown) => e as Error);

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.message).toContain("google/gemini-2.5-flash-preview-tts");
    expect(error.message).toContain("finishReason: MAX_TOKENS");
    expect(error.message).toContain(`text response: "I can't voice that."`);
  });
});

describe("ElevenLabs missing audio_base64 diagnostics", () => {
  function elevenLabsProvider(
    payload: unknown,
    headers: Record<string, string>
  ) {
    return new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { "Content-Type": "application/json", ...headers },
        })
      ),
    });
  }

  it("names the request-id and which alignments came back", async () => {
    const provider = elevenLabsProvider(
      {
        alignment: {
          characters: ["H", "i"],
          character_start_times_seconds: [0, 0.05],
          character_end_times_seconds: [0.05, 0.1],
        },
      },
      { "request-id": "req_abc123" }
    );

    const error = await provider
      .generate({
        modelId: "eleven_v3",
        text: "Ein ganz gewöhnlicher Absatz.",
        voice: "voice-id",
        includeTimestamps: true,
      })
      .catch((e: unknown) => e as Error);

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.message).toContain("elevenlabs/eleven_v3");
    expect(error.message).toContain("request-id: req_abc123");
    expect(error.message).toContain("alignment: present");
    expect(error.message).toContain("normalized_alignment: absent");
  });

  it("reports both alignments absent and no request-id", async () => {
    const provider = elevenLabsProvider({}, {});

    const error = await provider
      .generate({
        modelId: "eleven_v3",
        text: "Ein ganz gewöhnlicher Absatz.",
        voice: "voice-id",
        includeTimestamps: true,
      })
      .catch((e: unknown) => e as Error);

    expect(error.message).toContain("request-id: none");
    expect(error.message).toContain("alignment: absent");
    expect(error.message).toContain("normalized_alignment: absent");
  });
});
