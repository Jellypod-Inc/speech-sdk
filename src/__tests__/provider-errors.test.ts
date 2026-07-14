import { describe, expect, it, vi } from "vitest";
import { deriveTimestampsViaSTT } from "../derive-timestamps.js";
import { SpeechSdkProviderError } from "../index.js";
import type { SpeechToTextProvider } from "../speech-to-text-provider.js";

describe("SpeechSdkProviderError", () => {
  it("marks fallback transcription failures as alignment errors", async () => {
    const original = new SpeechSdkProviderError("API error 422: bad audio", {
      status: 422,
      provider: "forced-alignment",
      model: "align-v1",
      code: "INVALID_AUDIO",
      details: { error: { reason: "INVALID_AUDIO" } },
      rawResponse: '{"error":{"reason":"INVALID_AUDIO"}}',
      retryable: false,
    });
    const sttProvider: SpeechToTextProvider = {
      id: "forced-alignment",
      defaultModel: "align-v1",
      models: [],
      transcribe: vi.fn().mockRejectedValue(original),
    };

    const thrown = await deriveTimestampsViaSTT({
      ttsModel: "google/gemini-3.1-flash-tts-preview",
      audio: new Uint8Array([1, 2]),
      mediaType: "audio/wav",
      text: "Hello",
      timestampFallback: {
        provider: sttProvider,
        modelId: "align-v1",
      },
      abortSignal: undefined,
    }).catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(SpeechSdkProviderError);
    expect(thrown).toMatchObject({
      provider: "forced-alignment",
      model: "align-v1",
      code: "INVALID_AUDIO",
      stage: "alignment",
      retryable: false,
    });
    expect((thrown as SpeechSdkProviderError).cause).toBe(original);
  });

  it("exposes provider fields as enumerable own properties", () => {
    const error = new SpeechSdkProviderError("API error 429: rate limited", {
      status: 429,
      provider: "example",
      model: "speech-v1",
      retryable: true,
    });

    expect(Object.keys(error)).toEqual(
      expect.arrayContaining([
        "status",
        "provider",
        "model",
        "retryable",
        "statusCode",
      ])
    );
  });
});
