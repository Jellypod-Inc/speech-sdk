import { describe, expect, it, vi } from "vitest";
import {
  NoSpeechGeneratedError,
  type NoSpeechReason,
  withTurnIndex,
} from "../errors.js";
import { generateSpeech } from "../generate-speech.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";
import type { SpeechProvider } from "../speech-provider.js";

const AUDIO = new Uint8Array([0, 1, 2, 3]);
const AUDIO_B64 = "AAECAw==";

function jsonResponse(payload: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function elevenLabs(...responses: Response[]) {
  const fetchMock = vi.fn();
  for (const response of responses) {
    fetchMock.mockResolvedValueOnce(response);
  }
  return {
    fetchMock,
    provider: new ElevenLabsSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    }),
  };
}

// The shape ElevenLabs returns on the failure this classification exists for: 200, alignment, no audio.
function emptyWithTimestamps(requestId?: string) {
  return jsonResponse(
    {
      alignment: {
        characters: ["H", "i"],
        character_start_times_seconds: [0, 0.05],
        character_end_times_seconds: [0.05, 0.1],
      },
    },
    requestId ? { "request-id": requestId } : {}
  );
}

function emptyAudio() {
  return new Response(new Uint8Array(), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}

function refusingProvider(reason: NoSpeechReason): SpeechProvider {
  return {
    id: "mock",
    defaultModel: "mock-model",
    generate: vi.fn().mockRejectedValue(
      new NoSpeechGeneratedError("mock: no audio", {
        model: "mock-model",
        provider: "mock",
        reason,
      })
    ),
  };
}

describe("NoSpeechGeneratedError classification", () => {
  it("derives retryable from the reason", () => {
    expect(
      new NoSpeechGeneratedError("empty", {
        reason: "provider_empty_response",
      }).retryable
    ).toBe(true);
    expect(
      new NoSpeechGeneratedError("refused", { reason: "content_refusal" })
        .retryable
    ).toBe(false);
    expect(
      new NoSpeechGeneratedError("no words", { reason: "empty_input" })
        .retryable
    ).toBe(false);
  });

  it("presumes an untagged error is an empty provider response", () => {
    const error = new NoSpeechGeneratedError();
    expect(error.reason).toBe("provider_empty_response");
    expect(error.retryable).toBe(true);
  });

  it("keeps the classification when a turn index is attached", () => {
    const error = withTurnIndex(
      new NoSpeechGeneratedError("refused", {
        model: "gemini-3.1-flash-tts-preview",
        provider: "google",
        reason: "content_refusal",
        requestId: "req_abc123",
      }),
      4
    );

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    const noSpeech = error as NoSpeechGeneratedError;
    expect(noSpeech.reason).toBe("content_refusal");
    expect(noSpeech.retryable).toBe(false);
    expect(noSpeech.provider).toBe("google");
    expect(noSpeech.model).toBe("gemini-3.1-flash-tts-preview");
    expect(noSpeech.requestId).toBe("req_abc123");
    expect(noSpeech.turnIndex).toBe(4);
  });
});

describe("provider classification", () => {
  it("marks an ElevenLabs empty response retryable and carries its request-id", async () => {
    const { provider } = elevenLabs(
      emptyWithTimestamps("req_abc123"),
      emptyAudio()
    );

    const error = (await provider
      .generate({
        modelId: "eleven_v3",
        text: "Ein ganz gewöhnlicher Absatz.",
        voice: "voice-id",
        includeTimestamps: true,
      })
      .catch((e: unknown) => e)) as NoSpeechGeneratedError;

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.reason).toBe("provider_empty_response");
    expect(error.retryable).toBe(true);
    expect(error.provider).toBe("elevenlabs");
    expect(error.model).toBe("eleven_v3");
    expect(error.requestId).toBe("req_abc123");
  });

  it("marks a Gemini safety decline terminal", async () => {
    const google = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        jsonResponse({
          candidates: [{ finishReason: "SAFETY", content: {} }],
        })
      ),
    });

    const error = (await google
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "A line the model will not voice.",
        voice: "Kore",
      })
      .catch((e: unknown) => e)) as NoSpeechGeneratedError;

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.reason).toBe("content_refusal");
    expect(error.retryable).toBe(false);
    expect(error.provider).toBe("google");
  });

  it("leaves a Gemini PROHIBITED_CONTENT decline retryable", async () => {
    const google = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        jsonResponse({
          candidates: [{ finishReason: "PROHIBITED_CONTENT", content: {} }],
        })
      ),
    });

    const error = (await google
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "A perfectly ordinary paragraph to voice.",
        voice: "Kore",
      })
      .catch((e: unknown) => e)) as NoSpeechGeneratedError;

    expect(error.reason).toBe("provider_empty_response");
    expect(error.retryable).toBe(true);
  });

  it("marks a Gemini response that answered instead of voicing retryable", async () => {
    const google = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        jsonResponse({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "Sure!" }] } },
          ],
        })
      ),
    });

    const error = (await google
      .generate({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "A perfectly ordinary paragraph to voice.",
        voice: "Kore",
      })
      .catch((e: unknown) => e)) as NoSpeechGeneratedError;

    expect(error.reason).toBe("provider_empty_response");
    expect(error.retryable).toBe(true);
  });
});

describe("generateSpeech retry policy", () => {
  it("recovers when an ElevenLabs empty response is followed by audio", async () => {
    const { fetchMock, provider } = elevenLabs(
      emptyWithTimestamps("req_abc123"),
      emptyAudio(),
      jsonResponse({
        audio_base64: AUDIO_B64,
        alignment: {
          characters: ["H", "i"],
          character_start_times_seconds: [0, 0.05],
          character_end_times_seconds: [0.05, 0.1],
        },
      })
    );

    const result = await generateSpeech({
      model: { provider, modelId: "eleven_v3" },
      text: "Hi",
      timestamps: true,
      voice: "voice-id",
    });

    expect(result.audio.uint8Array).toEqual(AUDIO);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  }, 15_000);

  it("does not repeat a request the provider refused", async () => {
    const provider = refusingProvider("content_refusal");

    await expect(
      generateSpeech({
        model: { provider, modelId: "mock-model" },
        text: "A line the model will not voice.",
        voice: "test-voice",
      })
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);

    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it("repeats a request that came back empty", async () => {
    const provider = refusingProvider("provider_empty_response");

    await expect(
      generateSpeech({
        maxRetries: 1,
        model: { provider, modelId: "mock-model" },
        text: "Ein ganz gewöhnlicher Absatz.",
        voice: "test-voice",
      })
    ).rejects.toBeInstanceOf(NoSpeechGeneratedError);

    expect(provider.generate).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("classifies text that holds no words as terminal", async () => {
    const provider = {
      id: "mock",
      defaultModel: "mock-model",
      generate: vi.fn(),
    } satisfies SpeechProvider;

    const error = (await generateSpeech({
      model: { provider, modelId: "mock-model" },
      text: "   ",
      voice: "test-voice",
    }).catch((e: unknown) => e)) as NoSpeechGeneratedError;

    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error.reason).toBe("empty_input");
    expect(error.retryable).toBe(false);
    expect(provider.generate).not.toHaveBeenCalled();
  });
});
