import { describe, expect, it, vi } from "vitest";
import { ApiError, NoSpeechGeneratedError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider } from "../speech-provider.js";

function makePcm16Bytes(): Uint8Array {
  const samples = new Int16Array(2400);
  samples.fill(100);
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

function pcmStitchProvider(): SpeechProvider {
  return {
    id: "mock",
    defaultModel: "m",
    models: [],
    generate: vi.fn().mockResolvedValue({
      audio: makePcm16Bytes(),
      mediaType: "audio/pcm;rate=24000",
    }),
    getStitchOptions: () => ({
      providerOptions: { format: "pcm24k" },
      mediaType: "audio/pcm;rate=24000",
    }),
  };
}

describe("turnIndex on errors thrown from a specific turn", () => {
  it("attributes ApiError to the failing turn in the stitch path", async () => {
    const successProvider = pcmStitchProvider();
    const failingProvider: SpeechProvider = {
      id: "mock-fail",
      defaultModel: "m",
      models: [],
      generate: vi.fn().mockRejectedValue(
        new ApiError("upstream rejected", {
          statusCode: 401,
          code: "auth_failed",
        })
      ),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm24k" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    let caught: unknown;
    try {
      await generateConversation({
        turns: [
          {
            model: { provider: successProvider, modelId: "m" },
            voice: "a",
            text: "ok",
          },
          {
            model: { provider: failingProvider, modelId: "m" },
            voice: "b",
            text: "boom",
          },
          {
            model: { provider: successProvider, modelId: "m" },
            voice: "c",
            text: "ok",
          },
        ],
        maxRetries: 0,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    const apiErr = caught as ApiError;
    expect(apiErr.turnIndex).toBe(1);
    expect(apiErr.statusCode).toBe(401);
    expect(apiErr.code).toBe("auth_failed");
  });

  it("attributes NoSpeechGeneratedError to the failing turn in the stitch path", async () => {
    const successProvider = pcmStitchProvider();
    const emptyProvider: SpeechProvider = {
      id: "mock-empty",
      defaultModel: "m",
      models: [],
      generate: vi.fn().mockResolvedValue({
        audio: new Uint8Array(0),
        mediaType: "audio/pcm;rate=24000",
      }),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm24k" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    let caught: unknown;
    try {
      await generateConversation({
        turns: [
          {
            model: { provider: successProvider, modelId: "m" },
            voice: "a",
            text: "ok",
          },
          {
            model: { provider: successProvider, modelId: "m" },
            voice: "b",
            text: "ok",
          },
          {
            model: { provider: emptyProvider, modelId: "m" },
            voice: "c",
            text: "empty",
          },
        ],
        maxRetries: 0,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(NoSpeechGeneratedError);
    expect((caught as NoSpeechGeneratedError).turnIndex).toBe(2);
  });

  it("leaves turnIndex undefined for single-turn generateSpeech failures", async () => {
    const provider: SpeechProvider = {
      id: "mock",
      defaultModel: "m",
      models: [],
      generate: vi
        .fn()
        .mockRejectedValue(new ApiError("nope", { statusCode: 500 })),
    };

    let caught: unknown;
    try {
      await generateSpeech({
        model: { provider, modelId: "m" },
        text: "hi",
        voice: "a",
        maxRetries: 0,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).turnIndex).toBeUndefined();
  });

  it("leaves turnIndex undefined for native dialogue path failures", async () => {
    const nativeProvider: SpeechProvider = {
      id: "mock-native",
      defaultModel: "m",
      models: [],
      generate: vi.fn(),
      generateDialogue: vi
        .fn()
        .mockRejectedValue(new ApiError("native blew up", { statusCode: 503 })),
      dialogueCapabilities: () => ({ maxVoices: 4 }),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm24k" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    let caught: unknown;
    try {
      await generateConversation({
        model: { provider: nativeProvider, modelId: "m" },
        turns: [
          { voice: "a", text: "hi" },
          { voice: "b", text: "there" },
        ],
        maxRetries: 0,
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).turnIndex).toBeUndefined();
  });

  it("preserves the original error as cause when wrapping with turnIndex", async () => {
    const original = new ApiError("upstream rejected", {
      statusCode: 429,
      code: "rate_limited",
    });
    const successProvider = pcmStitchProvider();
    const failingProvider: SpeechProvider = {
      id: "mock-fail",
      defaultModel: "m",
      models: [],
      generate: vi.fn().mockRejectedValue(original),
      getStitchOptions: () => ({
        providerOptions: { format: "pcm24k" },
        mediaType: "audio/pcm;rate=24000",
      }),
    };

    let caught: unknown;
    try {
      await generateConversation({
        turns: [
          {
            model: { provider: failingProvider, modelId: "m" },
            voice: "a",
            text: "boom",
          },
          {
            model: { provider: successProvider, modelId: "m" },
            voice: "b",
            text: "ok",
          },
        ],
        maxRetries: 0,
      });
    } catch (err) {
      caught = err;
    }

    const wrapped = caught as ApiError;
    expect(wrapped.turnIndex).toBe(0);
    expect(wrapped.cause).toBe(original);
  });
});
