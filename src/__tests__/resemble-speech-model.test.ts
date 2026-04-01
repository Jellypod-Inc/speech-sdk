import { describe, it, expect, vi } from 'vitest';
import { ResembleSpeechProvider } from '../providers/resemble/resemble-speech-model.js';

describe('ResembleSpeechProvider', () => {
  const mockJsonResponse = (audioContent = 'dGVzdA==') =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ audio_content: audioContent }),
    });

  it('calls the correct URL', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new ResembleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello world',
      voice: 'uuid-123',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://p.cluster.resemble.ai/synthesize');
    expect(init.method).toBe('POST');
  });

  it('sends Bearer auth header', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new ResembleSpeechProvider({
      apiKey: 'resemble-key-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'default', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('resemble-key-123');
  });

  it('sends correct body with voice_uuid and data', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new ResembleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello world',
      voice: 'uuid-abc',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_uuid).toBe('uuid-abc');
    expect(body.data).toBe('Hello world');
  });

  it('returns base64 audio string and mediaType', async () => {
    const mockFetch = mockJsonResponse('YXVkaW9kYXRh');

    const provider = new ResembleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'default',
      text: 'Hello',
    });

    expect(result.audio).toBe('YXVkaW9kYXRh');
    expect(result.mediaType).toBe('audio/wav');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new ResembleSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'default', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new ResembleSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'default', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/synthesize');
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new ResembleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello',
      providerOptions: { sample_rate: 44100 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.sample_rate).toBe(44100);
  });
});
