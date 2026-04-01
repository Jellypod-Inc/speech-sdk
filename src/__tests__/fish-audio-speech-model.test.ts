import { describe, it, expect, vi } from 'vitest';
import { FishAudioSpeechProvider } from '../providers/fish-audio/index.js';

describe('FishAudioSpeechProvider', () => {
  it('sends model as a request header, not in body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 's2-pro',
      text: 'Hello world',
      voice: 'voice-123',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.fish.audio/v1/tts');
    expect(init.headers['model']).toBe('s2-pro');

    const body = JSON.parse(init.body);
    expect(body.model).toBeUndefined();
  });

  it('maps voice to reference_id in body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 's2-pro',
      text: 'Hello',
      voice: 'my-voice-id',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reference_id).toBe('my-voice-id');
    expect(body.text).toBe('Hello');
  });

  it('returns binary audio response', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/wav' }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 's2-pro',
      text: 'Hello',
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/wav');
  });

  it('sends Bearer auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: 'fish-key-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 's2-pro', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer fish-key-123');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "unauthorized"}',
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 's2-pro', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 's2-pro',
      text: 'Hello',
      providerOptions: { format: 'mp3', bitrate: 128 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.format).toBe('mp3');
    expect(body.bitrate).toBe(128);
  });
});
