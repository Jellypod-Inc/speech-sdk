import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import type { SpeechProvider } from "../speech-provider.js";
import { streamSpeech } from "../stream-speech.js";

function createMetadataProvider(
  overrides?: Partial<{
    audio: string | Uint8Array;
    mediaType: string;
    providerMetadata: Record<string, unknown>;
    audioDurationMs: number;
  }>
): SpeechProvider {
  return {
    id: "test-provider",
    defaultModel: "test-model",
    models: [
      {
        id: "test-model",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: ["streaming"],
      },
    ],
    generate: vi.fn().mockResolvedValue({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: "audio/mpeg",
      ...overrides,
    }),
  };
}

describe("generateSpeech metadata", () => {
  it("includes provider and model in metadata", async () => {
    const provider = createMetadataProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello world",
      voice: "v",
    });

    expect(result.metadata.provider).toBe("test-provider");
    expect(result.metadata.model).toBe("test-model");
  });

  it("includes inputChars as length of processed text", async () => {
    const provider = createMetadataProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello world",
      voice: "v",
    });

    expect(result.metadata.inputChars).toBe(11);
  });

  it("includes latencyMs as a positive number", async () => {
    const provider = createMetadataProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.metadata.latencyMs).toBe("number");
  });

  it("does not include ttfbMs for non-streaming", async () => {
    const provider = createMetadataProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    expect(result.metadata.ttfbMs).toBeUndefined();
  });

  it("includes audioDurationMs when provider returns it", async () => {
    const provider = createMetadataProvider({ audioDurationMs: 1500 });
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    expect(result.metadata.audioDurationMs).toBe(1500);
  });

  it("omits audioDurationMs when provider does not return it", async () => {
    const provider = createMetadataProvider();
    const result = await generateSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    expect(result.metadata.audioDurationMs).toBeUndefined();
  });
});

function bytesStream(payload: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(payload);
      controller.close();
    },
  });
}

function createStreamProvider(
  overrides?: Partial<{
    stream: ReadableStream<Uint8Array>;
    mediaType: string;
    providerMetadata: Record<string, unknown>;
    audioDurationMs: number;
  }>
): SpeechProvider {
  return {
    id: "test-provider",
    defaultModel: "test-model",
    models: [
      {
        id: "test-model",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: ["streaming"],
      },
    ],
    generate: vi.fn(),
    stream: vi.fn().mockResolvedValue({
      stream: bytesStream(new Uint8Array([1, 2, 3])),
      mediaType: "audio/mpeg",
      ...overrides,
    }),
  } as SpeechProvider;
}

describe("streamSpeech metadata", () => {
  it("includes provider and model in metadata", async () => {
    const provider = createStreamProvider();
    const result = await streamSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello world",
      voice: "v",
    });

    expect(result.metadata.provider).toBe("test-provider");
    expect(result.metadata.model).toBe("test-model");
  });

  it("includes inputChars", async () => {
    const provider = createStreamProvider();
    const result = await streamSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello world",
      voice: "v",
    });

    expect(result.metadata.inputChars).toBe(11);
  });

  it("includes ttfbMs as a non-negative number", async () => {
    const provider = createStreamProvider();
    const result = await streamSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    expect(result.metadata.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.metadata.ttfbMs).toBe("number");
  });

  it("includes latencyMs that is >= 0", async () => {
    const provider = createStreamProvider();
    const result = await streamSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    const reader = result.audio.getReader();
    while (!(await reader.read()).done) {
      /* drain */
    }

    expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("includes audioDurationMs when provider returns it", async () => {
    const provider = createStreamProvider({ audioDurationMs: 2500 });
    const result = await streamSpeech({
      model: { provider, modelId: "test-model" },
      text: "Hello",
      voice: "v",
    });

    expect(result.metadata.audioDurationMs).toBe(2500);
  });
});
