import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

const MODEL_ID = "gemini-3.1-flash-tts-preview";
const READ_ALOUD_DIRECTIVE = "Read aloud: ";
const CONSERVATIVE_REQUEST_CHAR_BUDGET = 5000;
const SENTENCE_NUMBER_RE = /Sentence (\d+)/;

function googleAudioResponse(marker = 0): Response {
  const pcm = new Uint8Array(new Int16Array([marker, marker]).buffer);
  const data = Buffer.from(pcm).toString("base64");
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  data,
                  mimeType: "audio/L16;rate=24000",
                },
              },
            ],
          },
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("Google Gemini TTS long input", () => {
  it("chunks bounded requests, stitches them in order, and aligns each chunk against its own audio", async () => {
    const prompts: string[] = [];
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          contents: [{ parts: [{ text: string }] }];
        };
        const prompt = body.contents[0].parts[0].text;
        prompts.push(prompt);
        const firstSentence = Number(SENTENCE_NUMBER_RE.exec(prompt)?.[1]);
        if (firstSentence === 0) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        return googleAudioResponse(firstSentence + 1);
      }
    );
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });
    const text = Array.from(
      { length: 600 },
      (_, index) => `Sentence ${index} stays in order.`
    ).join(" ");
    const instructions = "Use a calm delivery. ".repeat(50).trim();
    // Every mocked provider response carries 2 samples at 24 kHz.
    const chunkDurationSeconds = 2 / 24_000;
    const align = vi.fn(({ text: alignmentText }: { text: string }) => {
      const words = alignmentText.split(" ");
      const wordDuration = chunkDurationSeconds / words.length;
      return Promise.resolve(
        words.map((word, index) => ({
          text: word,
          start: index * wordDuration,
          end: (index + 1) * wordDuration,
        }))
      );
    });

    const result = await generateSpeech({
      model: { provider, modelId: MODEL_ID },
      text,
      instructions,
      voice: "Kore",
      output: { format: "pcm" },
      timestamps: true,
      timestampProvider: { align },
    });

    expect(prompts.length).toBeGreaterThan(1);
    expect(
      prompts.every(
        (prompt) => prompt.length <= CONSERVATIVE_REQUEST_CHAR_BUDGET
      )
    ).toBe(true);
    expect(
      prompts
        .map((prompt) => prompt.slice(prompt.indexOf(READ_ALOUD_DIRECTIVE)))
        .map((prompt) => prompt.slice(READ_ALOUD_DIRECTIVE.length))
        .join(" ")
    ).toBe(text);

    const expectedMarkers = prompts.flatMap((prompt) => {
      const firstSentence = Number(SENTENCE_NUMBER_RE.exec(prompt)?.[1]);
      return [firstSentence + 1, firstSentence + 1];
    });
    const actualSamples = new Int16Array(
      result.audio.uint8Array.buffer,
      result.audio.uint8Array.byteOffset,
      result.audio.uint8Array.byteLength / 2
    );
    expect(Array.from(actualSamples)).toEqual(expectedMarkers);
    expect(result.audio.mediaType).toBe("audio/pcm;rate=24000");

    expect(align).toHaveBeenCalledTimes(prompts.length);
    const alignCalls = align.mock.calls.map(
      ([input]) => input as unknown as { mediaType: string; text: string }
    );
    expect(alignCalls.every((call) => call.mediaType === "audio/wav")).toBe(
      true
    );
    expect(alignCalls.map((call) => call.text).join(" ")).toBe(text);
    expect(result.timestamps?.map(({ text: word }) => word)).toEqual(
      text.split(" ")
    );
    const starts = result.timestamps?.map(({ start }) => start) ?? [];
    for (let index = 1; index < starts.length; index++) {
      expect(starts[index]).toBeGreaterThanOrEqual(starts[index - 1] ?? 0);
    }
    expect(result.metadata.timestampsSource).toBe("aligned");
  });

  it("keeps normal input to one Google request", async () => {
    const fetchMock = vi.fn().mockImplementation(() => googleAudioResponse());
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });

    await generateSpeech({
      model: { provider, modelId: MODEL_ID },
      text: "A normal-sized request.",
      voice: "Kore",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("declares conservative limits on every Gemini TTS model", () => {
    const provider = new GoogleSpeechProvider({ apiKey: "test-key" });

    expect(provider.models.map(({ id }) => id)).toEqual([
      "gemini-3.1-flash-tts-preview",
      "gemini-2.5-flash-preview-tts",
      "gemini-2.5-pro-preview-tts",
    ]);
    for (const model of provider.models) {
      expect(model.maxInputChars).toBeGreaterThan(0);
      expect(model.maxInputChars).toBeLessThan(
        CONSERVATIVE_REQUEST_CHAR_BUDGET
      );
    }
  });
});
