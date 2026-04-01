import { describe, it, expect, vi } from 'vitest';
import { CartesiaSpeechProvider } from '../providers/cartesia/index.js';

describe('CartesiaSpeechProvider', () => {
  it('calls the correct URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'sonic-2',
      text: 'Hello world',
      voice: 'voice-123',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.cartesia.ai/tts/bytes');
    expect(init.method).toBe('POST');
  });

  it('sends X-API-Key auth and Cartesia-Version headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'cartesia-key-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'sonic-2', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['X-API-Key']).toBe('cartesia-key-123');
    expect(init.headers['Cartesia-Version']).toBe('2025-04-16');
  });

  it('sends correct body with nested voice object', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'sonic-2',
      text: 'Hello world',
      voice: 'voice-abc',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model_id).toBe('sonic-2');
    expect(body.transcript).toBe('Hello world');
    expect(body.voice).toEqual({ mode: 'id', id: 'voice-abc' });
    expect(body.output_format).toEqual({
      container: 'wav',
      encoding: 'pcm_f32le',
      sample_rate: 44100,
    });
  });

  it('returns binary audio data and mediaType', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/wav' }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'sonic-2',
      text: 'Hello',
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/wav');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'sonic-2', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'sonic-2', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/tts/bytes');
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new CartesiaSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'sonic-2',
      text: 'Hello',
      providerOptions: { output_format: { container: 'wav' } },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.output_format).toEqual({ container: 'wav' });
  });
});
