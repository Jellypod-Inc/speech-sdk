import { describe, it, expect, vi } from 'vitest';
import { LMNTSpeechProvider } from '../providers/lmnt/lmnt-speech-model.js';

describe('LMNTSpeechProvider', () => {
  it('calls the correct URL with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new LMNTSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'blizzard',
      text: 'Hello world',
      voice: 'lily',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.lmnt.com/v1/ai/speech/bytes');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('blizzard');
    expect(body.text).toBe('Hello world');
    expect(body.voice).toBe('lily');
  });

  it('sends X-API-Key auth header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new LMNTSpeechProvider({
      apiKey: 'lmnt-test-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'blizzard', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['X-API-Key']).toBe('lmnt-test-123');
  });

  it('returns audio data and mediaType', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/wav' }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new LMNTSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'blizzard',
      text: 'Hello',
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/wav');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () => '{"error": "forbidden"}',
    });

    const provider = new LMNTSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'blizzard', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new LMNTSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v1',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'blizzard', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v1/ai/speech/bytes');
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new LMNTSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'blizzard',
      text: 'Hello',
      providerOptions: { speed: 1.2 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.speed).toBe(1.2);
  });
});
