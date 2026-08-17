import { describe, expect, it, vi } from "vitest";
import { NoSpeechGeneratedError } from "../errors.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

const PCM_BASE64 = "AAAAAA==";

const AUDIO_RESPONSE = {
  candidates: [
    {
      finishReason: "STOP",
      content: {
        parts: [
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
};

const NO_AUDIO_RESPONSE = {
  candidates: [
    { finishReason: "STOP", content: { parts: [{ text: "Sure!" }] } },
  ],
};

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => data,
  };
}

// Returns the prompt text of each request the provider issued, in order.
function promptsFrom(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(
    ([, init]) => JSON.parse(init.body).contents[0].parts[0].text
  );
}

function provider(responses: unknown[]) {
  const fetchMock = vi.fn();
  for (const r of responses) {
    fetchMock.mockResolvedValueOnce(jsonResponse(r));
  }
  return {
    fetchMock,
    google: new GoogleSpeechProvider({ apiKey: "test-key", fetch: fetchMock }),
  };
}

describe("Google terse-input reshaped retry", () => {
  it("does not fire when the first attempt returns audio", async () => {
    const { fetchMock, google } = provider([AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Yes",
      voice: "Kore",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(promptsFrom(fetchMock)).toEqual(["Read aloud: Yes"]);
  });

  it("retries a one-word input with a quoted, punctuated payload and succeeds", async () => {
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE, AUDIO_RESPONSE]);

    const result = await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Yes",
      voice: "Kore",
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(promptsFrom(fetchMock)).toEqual([
      "Read aloud: Yes",
      'Read aloud: "Yes."',
    ]);
  });

  // Gemini 3.1 declares 80 languages and the terse threshold is exactly where CJK, Devanagari and Arabic
  // lines land, so a Latin-only terminator set would append a second terminator to text that already ends one.
  it.each([
    ["Yes.", 'Read aloud: "Yes."'],
    ["Really?", 'Read aloud: "Really?"'],
    ["Well,", 'Read aloud: "Well,"'],
    ["はい。", 'Read aloud: "はい。"'],
    ["नमस्ते।", 'Read aloud: "नमस्ते।"'],
    ["نعم۔", 'Read aloud: "نعم۔"'],
    ["そう", 'Read aloud: "そう."'],
  ])("wraps %s without doubling terminal punctuation", async (text, expected) => {
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE, AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text,
      voice: "Kore",
    });

    expect(promptsFrom(fetchMock)[1]).toBe(expected);
  });

  it("carries instructions through to the reshaped attempt", async () => {
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE, AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Yes",
      instructions: "Speak warmly.",
      voice: "Kore",
    });

    expect(promptsFrom(fetchMock)[1]).toBe(
      'Speak warmly.\n\nRead aloud: "Yes."'
    );
  });

  it("does not retry input longer than the terse threshold", async () => {
    const longText =
      "This is an ordinary sentence that is comfortably past the terse threshold.";
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE]);

    await expect(
      google.generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: longText,
        voice: "Kore",
      })
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Both matched and unmatched quotes: re-quoting either yields a no-op or a nested quote, neither worth a request.
  it.each([
    '"Yes."',
    '"Yes',
    'He said "yes',
  ])("does not retry input already containing a quote (%s)", async (text) => {
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE]);

    await expect(
      google.generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text,
        voice: "Kore",
      })
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a safety finish reason", { candidates: [{ finishReason: "SAFETY" }] }],
    [
      "a prompt-level block",
      { candidates: [], promptFeedback: { blockReason: "OTHER" } },
    ],
  ])("does not retry a content refusal (%s)", async (_label, response) => {
    const { fetchMock, google } = provider([response]);

    await expect(
      google.generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yes",
        voice: "Kore",
      })
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries at most once and reports both attempts when both come back empty", async () => {
    const { fetchMock, google } = provider([
      NO_AUDIO_RESPONSE,
      NO_AUDIO_RESPONSE,
    ]);

    const error = await google
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "Yes",
        voice: "Kore",
      })
      .catch((e: unknown) => e as Error);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.message).toContain("retried with a quoted payload");
    expect(error.message).toContain('text response: "Sure!"');
  });
});
