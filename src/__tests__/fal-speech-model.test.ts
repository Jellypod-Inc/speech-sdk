import { describe, it, expect, vi } from 'vitest';
import { FalSpeechProvider } from '../providers/fal/index.js';

describe('FalSpeechProvider', () => {
  it('uses modelId in URL path', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/audio.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'inworld-tts',
      text: 'Hello world',
      voice: 'en-male',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://fal.run/fal-ai/inworld-tts');
  });

  it('sends Key auth header (not Bearer)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/audio.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'fal-key-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'inworld-tts', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Key fal-key-123');
  });

  it('maps string voice to voice field in body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/audio.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'inworld-tts',
      text: 'Hello',
      voice: 'en-female',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBe('en-female');
    expect(body.audio_url).toBeUndefined();
  });

  it('maps { url } voice to audio_url field in body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/audio.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'inworld-tts',
      text: 'Hello',
      voice: { url: 'https://example.com/ref.wav' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.audio_url).toBe('https://example.com/ref.wav');
    expect(body.voice).toBeUndefined();
  });

  it('performs two-step fetch: JSON then audio download', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/result.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => audioData.buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'inworld-tts',
      text: 'Hello',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Second call fetches the audio URL from JSON response
    const [secondUrl] = mockFetch.mock.calls[1];
    expect(secondUrl).toBe('https://cdn.fal.ai/result.mp3');

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/audio.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'inworld-tts',
      text: 'Hello',
      providerOptions: { language: 'en', speed: 1.5 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.language).toBe('en');
    expect(body.speed).toBe(1.5);
    expect(body.text).toBe('Hello');
  });

  it('throws error when no modelId is provided', async () => {
    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: vi.fn(),
    });

    await expect(
      provider.generate({ modelId: '', text: 'Hello' }),
    ).rejects.toThrow('fal-ai requires a model ID');
  });

  it('omits voice fields when no voice is provided', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ audio: { url: 'https://cdn.fal.ai/audio.mp3' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new FalSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'inworld-tts',
      text: 'Hello',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice).toBeUndefined();
    expect(body.audio_url).toBeUndefined();
    expect(body.text).toBe('Hello');
  });
});
