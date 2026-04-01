import { describe, it, expect, vi } from 'vitest';
import { UnrealSpeechProvider } from '../providers/unreal-speech/unreal-speech-speech-model.js';

describe('UnrealSpeechProvider', () => {
  it('sends PascalCase body keys (VoiceId, Text)', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ OutputUri: 'https://s3.example.com/audio.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

    const provider = new UnrealSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello world',
      voice: 'Scarlett',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.VoiceId).toBe('Scarlett');
    expect(body.Text).toBe('Hello world');
  });

  it('performs two-step fetch: JSON then audio download', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ OutputUri: 'https://s3.example.com/audio.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      });

    const provider = new UnrealSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'default',
      text: 'Hello',
      voice: 'Dan',
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call: API endpoint
    const [firstUrl] = mockFetch.mock.calls[0];
    expect(firstUrl).toBe('https://api.v7.unrealspeech.com/speech');

    // Second call: S3 audio URL
    const [secondUrl] = mockFetch.mock.calls[1];
    expect(secondUrl).toBe('https://s3.example.com/audio.mp3');

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(new Uint8Array([1, 2, 3]));
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('sends Bearer auth header', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ OutputUri: 'https://s3.example.com/audio.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new UnrealSpeechProvider({
      apiKey: 'unreal-key-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'default', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer unreal-key-123');
  });

  it('throws on first fetch error', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => 'Internal Server Error',
    });

    const provider = new UnrealSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'default', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('throws on second fetch (audio download) error', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ OutputUri: 'https://s3.example.com/audio.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => 'Forbidden',
      });

    const provider = new UnrealSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'default', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ OutputUri: 'https://s3.example.com/audio.mp3' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'audio/mpeg' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      });

    const provider = new UnrealSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello',
      providerOptions: { Speed: 0.5 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.Speed).toBe(0.5);
  });
});
