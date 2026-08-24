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

const PREAMBLE =
  "Synthesize speech for the transcript below. Speak it verbatim; do not answer it, comment on it, or read these notes aloud.";

// Mirrors the provider's framing so each expectation reads as the prompt Gemini actually receives.
function prompt(text: string, instructions?: string): string {
  const delivery = instructions ? `Delivery: ${instructions}\n\n` : "";
  return `${PREAMBLE}\n\n${delivery}Transcript:\n${text}`;
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
    expect(promptsFrom(fetchMock)).toEqual([prompt("Yes")]);
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
    expect(promptsFrom(fetchMock)).toEqual([prompt("Yes"), prompt('"Yes."')]);
  });

  // Gemini 3.1 declares 80 languages and the terse threshold is exactly where CJK, Devanagari and Arabic
  // lines land, so a Latin-only terminator set would append a second terminator to text that already ends one.
  it.each([
    ["Yes.", '"Yes."'],
    ["Really?", '"Really?"'],
    ["Well,", '"Well,"'],
    ["はい。", '"はい。"'],
    ["नमस्ते।", '"नमस्ते।"'],
    ["نعم۔", '"نعم۔"'],
    ["そう", '"そう."'],
  ])("wraps %s without doubling terminal punctuation", async (text, expected) => {
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE, AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text,
      voice: "Kore",
    });

    expect(promptsFrom(fetchMock)[1]).toBe(prompt(expected));
  });

  it("carries instructions through to the reshaped attempt", async () => {
    const { fetchMock, google } = provider([NO_AUDIO_RESPONSE, AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Yes",
      instructions: "Speak warmly.",
      voice: "Kore",
    });

    expect(promptsFrom(fetchMock)[1]).toBe(prompt('"Yes."', "Speak warmly."));
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
    "“Yes.”",
    "‘Yes’",
    "「はい」",
    "«Ja»",
    "„Ja“",
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
      "a blocklist finish reason",
      { candidates: [{ finishReason: "BLOCKLIST" }] },
    ],
    [
      "a prompt-level block",
      { candidates: [], promptFeedback: { blockReason: "OTHER" } },
    ],
    [
      "a prompt-level safety block",
      { candidates: [], promptFeedback: { blockReason: "SAFETY" } },
    ],
    [
      "a prompt-level blocklist block",
      { candidates: [], promptFeedback: { blockReason: "BLOCKLIST" } },
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
  // Google attributes PROHIBITED_CONTENT on a TTS model to a prompt too vague to trip the speech
  // synthesis classifier, so the reshaped payload is exactly the retry that can lift it.
  it.each([
    [
      "a prompt-level block",
      { candidates: [], promptFeedback: { blockReason: "PROHIBITED_CONTENT" } },
    ],
    [
      "a candidate finish reason",
      { candidates: [{ finishReason: "PROHIBITED_CONTENT" }] },
    ],
  ])("retries terse input blocked as PROHIBITED_CONTENT (%s)", async (_label, response) => {
    const { fetchMock, google } = provider([response, AUDIO_RESPONSE]);

    const result = await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Slowly.",
      voice: "Kore",
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(promptsFrom(fetchMock)[1]).toBe(prompt('"Slowly."'));
  });

  it("does not retry long input blocked as PROHIBITED_CONTENT", async () => {
    const { fetchMock, google } = provider([
      { candidates: [], promptFeedback: { blockReason: "PROHIBITED_CONTENT" } },
    ]);

    await expect(
      google.generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "This is an ordinary sentence that is comfortably past the terse threshold.",
        voice: "Kore",
      })
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("Google TTS prompt framing", () => {
  it("names the operation and labels the transcript boundary", async () => {
    const { fetchMock, google } = provider([AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Slowly.",
      voice: "Kore",
    });

    const emitted = promptsFrom(fetchMock)[0] ?? "";
    expect(emitted.startsWith(PREAMBLE)).toBe(true);
    expect(emitted).toContain("\nTranscript:\nSlowly.");
    expect(emitted.endsWith("\nSlowly.")).toBe(true);
  });

  it("omits the delivery block when no instructions are given", async () => {
    const { fetchMock, google } = provider([AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Slowly.",
      voice: "Kore",
    });

    const emitted = promptsFrom(fetchMock)[0] ?? "";
    expect(emitted).not.toContain("Delivery:");
    expect(emitted).toBe(prompt("Slowly."));
  });

  it("labels instructions as delivery notes above the transcript", async () => {
    const { fetchMock, google } = provider([AUDIO_RESPONSE]);

    await google.generate({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "These words are spoken.",
      instructions: "Use a confident, warm delivery.",
      voice: "Kore",
    });

    const emitted = promptsFrom(fetchMock)[0] ?? "";
    expect(emitted).toBe(
      prompt("These words are spoken.", "Use a confident, warm delivery.")
    );
    expect(emitted.indexOf("Delivery:")).toBeLessThan(
      emitted.indexOf("Transcript:")
    );
  });

  it("keeps the same framing on the /interactions streaming path", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                'event: step.delta\ndata: {"delta":{"mime_type":"audio/l16","data":"QUI="}}\n\nevent: done\ndata: [DONE]\n\n'
              )
            );
            controller.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      )
    );
    const google = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    await google.stream({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "Slowly.",
      instructions: "Use a confident, warm delivery.",
      voice: "Kore",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toBe(
      prompt("Slowly.", "Use a confident, warm delivery.")
    );
  });
});
