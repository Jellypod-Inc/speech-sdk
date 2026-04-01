import { describe, it, expect, vi } from 'vitest';
import { SpeechifySpeechProvider } from '../providers/speechify/speechify-speech-model.js';

describe('SpeechifySpeechProvider', () => {
  const mockJsonResponse = (audioData = 'dGVzdA==') =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ audio_data: audioData }),
    });

  it('calls the correct URL', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new SpeechifySpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'simba-multilingual',
      text: 'Hello world',
      voice: 'george',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.speechify.ai/v1/audio/speech');
    expect(init.method).toBe('POST');
  });

  it('sends Bearer auth header', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new SpeechifySpeechProvider({
      apiKey: 'speechify-key-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'simba-multilingual', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer speechify-key-123');
  });

  it('sends correct body with input and voice_id', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new SpeechifySpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'simba-multilingual',
      text: 'Hello world',
      voice: 'george',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('simba-multilingual');
    expect(body.input).toBe('Hello world');
    expect(body.voice_id).toBe('george');
  });

  it('returns base64 audio string and mediaType', async () => {
    const mockFetch = mockJsonResponse('YXVkaW9kYXRh');

    const provider = new SpeechifySpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'simba-multilingual',
      text: 'Hello',
    });

    expect(result.audio).toBe('YXVkaW9kYXRh');
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new SpeechifySpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'simba-multilingual', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new SpeechifySpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v1',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'simba-multilingual', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v1/audio/speech');
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = mockJsonResponse();

    const provider = new SpeechifySpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'simba-multilingual',
      text: 'Hello',
      providerOptions: { language: 'en-US' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.language).toBe('en-US');
  });
});
