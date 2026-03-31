import { describe, it, expect, vi } from 'vitest';
import { OpenAISpeechProvider } from '../providers/openai/openai-speech-model.js';

describe('OpenAISpeechProvider', () => {
  it('calls the correct URL with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'tts-1',
      text: 'Hello world',
      voice: 'alloy',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/audio/speech');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('tts-1');
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('alloy');
  });

  it('sends authorization header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'sk-test-123',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'tts-1', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer sk-test-123');
  });

  it('maps providerOptions to request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/wav' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'gpt-4o-mini-tts',
      text: 'Hello',
      voice: 'nova',
      providerOptions: {
        speed: 1.5,
        instructions: 'Speak slowly',
        outputFormat: 'wav',
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.speed).toBe(1.5);
    expect(body.instructions).toBe('Speak slowly');
    expect(body.response_format).toBe('wav');
  });

  it('returns audio data and mediaType', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'tts-1',
      text: 'Hello',
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('throws ApiError on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'tts-1', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v1',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'tts-1', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v1/audio/speech');
  });

  it('merges additional headers', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new OpenAISpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'tts-1',
      text: 'Hello',
      headers: { 'X-Request-Id': 'abc-123' },
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['X-Request-Id']).toBe('abc-123');
  });
});
