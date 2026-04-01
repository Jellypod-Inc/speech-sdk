import { describe, it, expect, vi } from 'vitest';
import { WellSaidSpeechProvider } from '../providers/wellsaid/wellsaid-speech-model.js';

describe('WellSaidSpeechProvider', () => {
  it('calls the correct URL with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new WellSaidSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: '',
      text: 'Hello world',
      voice: 'speaker-42',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.wellsaidlabs.com/v1/tts/stream');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.text).toBe('Hello world');
    expect(body.speaker_id).toBe('speaker-42');
  });

  it('sends X-Api-Key auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new WellSaidSpeechProvider({
      apiKey: 'ws-test-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: '', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['X-Api-Key']).toBe('ws-test-123');
  });

  it('returns audio data and mediaType', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new WellSaidSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: '',
      text: 'Hello',
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "unauthorized"}',
    });

    const provider = new WellSaidSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: '', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new WellSaidSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v1',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: '', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v1/tts/stream');
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new WellSaidSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: '',
      text: 'Hello',
      providerOptions: { format: 'mp3' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.format).toBe('mp3');
  });
});
