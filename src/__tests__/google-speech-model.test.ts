import { describe, it, expect, vi } from 'vitest';
import { GoogleSpeechProvider } from '../providers/google/google-speech-model.js';

describe('GoogleSpeechProvider', () => {
  const geminiResponse = {
    candidates: [{
      content: {
        parts: [{ inlineData: { mimeType: 'audio/mp3', data: 'dGVzdA==' } }],
      },
    }],
  };

  function createMockFetch(data = geminiResponse) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => data,
    });
  }

  it('calls the Gemini API with model in URL and API key as query param', async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await provider.generate({
      modelId: 'gemini-2.5-flash-tts',
      text: 'Hello',
      voice: 'Kore',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-tts:generateContent?key=test-key',
    );
    expect(init.method).toBe('POST');
    expect(init.headers['Authorization']).toBeUndefined();
  });

  it('sends correct body with contents and speech_config', async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await provider.generate({
      modelId: 'gemini-2.5-flash-tts',
      text: 'Hello world',
      voice: 'Zephyr',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hello world' }] },
    ]);
    expect(body.generationConfig.responseModalities).toEqual(['audio']);
    expect(body.generationConfig.speech_config).toEqual({
      voice_config: {
        prebuilt_voice_config: { voice_name: 'Zephyr' },
      },
    });
  });

  it('returns base64 audio from Gemini response', async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    const result = await provider.generate({
      modelId: 'gemini-2.5-flash-tts',
      text: 'Hello',
      voice: 'Kore',
    });

    expect(result.audio).toBe('dGVzdA==');
    expect(result.mediaType).toBe('audio/mp3');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: async () => '{"error": "forbidden"}',
    });

    const provider = new GoogleSpeechProvider({ apiKey: 'bad-key', fetch: mockFetch });

    await expect(
      provider.generate({ modelId: 'gemini-2.5-flash-tts', text: 'Hello', voice: 'Kore' }),
    ).rejects.toThrow();
  });

  it('throws when no audio data in response', async () => {
    const mockFetch = createMockFetch({
      candidates: [{ content: { parts: [{ text: 'no audio' }] } }],
    });

    const provider = new GoogleSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await expect(
      provider.generate({ modelId: 'gemini-2.5-flash-tts', text: 'Hello', voice: 'Kore' }),
    ).rejects.toThrow('No audio data');
  });

  it('uses custom baseURL', async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v1beta',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'gemini-2.5-flash-tts', text: 'Hello', voice: 'Kore' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v1beta/models/gemini-2.5-flash-tts:generateContent?key=test-key');
  });

  it('spreads providerOptions into generationConfig', async () => {
    const mockFetch = createMockFetch();
    const provider = new GoogleSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await provider.generate({
      modelId: 'gemini-2.5-flash-tts',
      text: 'Hello',
      voice: 'Kore',
      providerOptions: { temperature: 0.5 },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.generationConfig.temperature).toBe(0.5);
  });
});
