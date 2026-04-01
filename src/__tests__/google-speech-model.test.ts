import { describe, it, expect, vi } from 'vitest';
import { GoogleSpeechProvider } from '../providers/google/google-speech-model.js';

describe('GoogleSpeechProvider', () => {
  const mockBase64 = btoa('test');

  function createMockFetch() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ audioContent: mockBase64 }),
    });
  }

  it('puts API key in query param, not header', async () => {
    const mockFetch = createMockFetch();

    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello',
      voice: 'en-US-Neural2-A',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://texttospeech.googleapis.com/v1/text:synthesize?key=test-key');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('derives languageCode from voice name', async () => {
    const mockFetch = createMockFetch();

    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hola',
      voice: 'es-ES-Standard-B',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice.languageCode).toBe('es-ES');
    expect(body.voice.name).toBe('es-ES-Standard-B');
  });

  it('sends correct body structure with input.text, voice, audioConfig', async () => {
    const mockFetch = createMockFetch();

    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello world',
      voice: 'en-US-Neural2-A',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.input).toEqual({ text: 'Hello world' });
    expect(body.voice).toEqual({ name: 'en-US-Neural2-A', languageCode: 'en-US' });
    expect(body.audioConfig).toEqual({ audioEncoding: 'MP3' });
  });

  it('parses base64 audioContent from JSON response', async () => {
    const mockFetch = createMockFetch();

    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'default',
      text: 'Hello',
      voice: 'en-US-Neural2-A',
    });

    expect(result.audio).toBe(mockBase64);
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () => '{"error": "forbidden"}',
    });

    const provider = new GoogleSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'default', text: 'Hello', voice: 'en-US-Neural2-A' }),
    ).rejects.toThrow();
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = createMockFetch();

    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello',
      voice: 'en-US-Neural2-A',
      providerOptions: { speakingRate: 1.5 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.speakingRate).toBe(1.5);
  });

  it('uses custom baseURL', async () => {
    const mockFetch = createMockFetch();

    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v1',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'default',
      text: 'Hello',
      voice: 'en-US-Neural2-A',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v1/text:synthesize?key=test-key');
  });
});
