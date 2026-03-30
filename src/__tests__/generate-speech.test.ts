import { describe, it, expect, vi } from 'vitest';
import { generateSpeech } from '../generate-speech.js';
import type { SpeechProvider } from '../speech-provider.js';

function createMockProvider(
  overrides?: Partial<ReturnType<SpeechProvider['generate']> extends Promise<infer T> ? T : never>,
): SpeechProvider {
  return {
    id: 'mock',
    defaultModel: 'mock-model',
    generate: vi.fn().mockResolvedValue({
      audio: new Uint8Array([72, 101, 108, 108, 111]), // "Hello"
      mediaType: 'audio/mpeg',
      ...overrides,
    }),
  };
}

describe('generateSpeech', () => {
  it('calls provider.generate and returns SpeechResult', async () => {
    const provider = createMockProvider();
    const result = await generateSpeech({
      model: { provider, modelId: 'test-model' },
      text: 'Hello world',
      voice: 'test-voice',
    });

    expect(result.audio.uint8Array).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    );
    expect(result.audio.mediaType).toBe('audio/mpeg');
    expect(result.audio.format).toBe('mp3');
    expect(result.audio.base64).toBe(btoa('Hello'));
  });

  it('passes text, voice, and providerOptions to provider', async () => {
    const provider = createMockProvider();
    await generateSpeech({
      model: { provider, modelId: 'test-model' },
      text: 'Hello',
      voice: 'some-voice',
      providerOptions: { speed: 1.5 },
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: 'test-model',
        text: 'Hello',
        voice: 'some-voice',
        providerOptions: { speed: 1.5 },
      }),
    );
  });

  it('passes headers and abortSignal to provider', async () => {
    const provider = createMockProvider();
    const controller = new AbortController();

    await generateSpeech({
      model: { provider, modelId: 'test-model' },
      text: 'Hello',
      headers: { 'X-Custom': 'value' },
      abortSignal: controller.signal,
    });

    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: { 'X-Custom': 'value' },
        abortSignal: controller.signal,
      }),
    );
  });

  it('returns providerMetadata when present', async () => {
    const provider = createMockProvider({
      providerMetadata: { requestId: 'req-123' },
    });

    const result = await generateSpeech({
      model: { provider, modelId: 'test-model' },
      text: 'Hello',
    });

    expect(result.providerMetadata).toEqual({ requestId: 'req-123' });
  });

  it('throws NoSpeechGeneratedError when audio is empty', async () => {
    const provider = createMockProvider({
      audio: new Uint8Array(0),
    });

    await expect(
      generateSpeech({
        model: { provider, modelId: 'test-model' },
        text: 'Hello',
      }),
    ).rejects.toThrow('No speech audio was generated.');
  });

  it('handles base64 string audio from provider', async () => {
    const provider = createMockProvider({
      audio: btoa('Hello'),
    });

    const result = await generateSpeech({
      model: { provider, modelId: 'test-model' },
      text: 'Hello',
    });

    expect(result.audio.base64).toBe(btoa('Hello'));
    expect(result.audio.uint8Array).toEqual(
      new Uint8Array([72, 101, 108, 108, 111]),
    );
  });

  it('retries on 5xx errors', async () => {
    const error = new Error('Server error') as Error & { statusCode: number };
    error.statusCode = 500;

    const provider: SpeechProvider = {
      id: 'mock',
      defaultModel: 'mock-model',
      generate: vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue({
          audio: new Uint8Array([1]),
          mediaType: 'audio/mpeg',
        }),
    };

    const result = await generateSpeech({
      model: { provider, modelId: 'test-model' },
      text: 'Hello',
      maxRetries: 1,
    });

    expect(result.audio.uint8Array).toEqual(new Uint8Array([1]));
    expect(provider.generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry on 4xx errors', async () => {
    const error = new Error('Auth error') as Error & { statusCode: number };
    error.statusCode = 401;

    const provider: SpeechProvider = {
      id: 'mock',
      defaultModel: 'mock-model',
      generate: vi.fn().mockRejectedValue(error),
    };

    await expect(
      generateSpeech({
        model: { provider, modelId: 'test-model' },
        text: 'Hello',
        maxRetries: 2,
      }),
    ).rejects.toThrow();
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });
});
