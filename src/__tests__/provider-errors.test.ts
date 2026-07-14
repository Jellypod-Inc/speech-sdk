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

  it("serializes non-JSON details without changing the original value", () => {
    const details: Record<string, unknown> = { requestNumber: 12n };
    details.self = details;
    const error = new SpeechSdkProviderError("API error 400: invalid", {
      status: 400,
      provider: "example",
      details,
      retryable: false,
    });

    const logged = JSON.parse(JSON.stringify(error));

    expect(logged.details).toEqual({
      requestNumber: "12n",
      self: "[Circular]",
    });
    expect(error.details).toBe(details);
    expect(details.requestNumber).toBe(12n);
    expect(details.self).toBe(details);
  });

  it("falls back safely when details serialization throws", () => {
    const error = new SpeechSdkProviderError("API error 400: invalid", {
      status: 400,
      provider: "example",
      details: {
        toJSON: () => {
          throw new Error("cannot serialize");
        },
      },
      retryable: false,
    });

    expect(JSON.parse(JSON.stringify(error)).details).toBe(
      "[Unserializable details]"
    );
  });
});
