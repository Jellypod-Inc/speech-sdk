import { describe, it, expect, vi } from 'vitest';
import { MistralSpeechProvider } from '../providers/mistral/mistral-speech-model.js';

describe('MistralSpeechProvider', () => {
  const mockJsonResponse = (data: Record<string, unknown>) =>
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => data,
    });

  it('calls the correct URL with string voice as voice_id', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await provider.generate({
      modelId: 'voxtral-mini-tts-2603',
      text: 'Hello world',
      voice: 'jessica',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.mistral.ai/v1/audio/speech');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.model).toBe('voxtral-mini-tts-2603');
    expect(body.input).toBe('Hello world');
    expect(body.voice_id).toBe('jessica');
    expect(body.ref_audio).toBeUndefined();
  });

  it('sends authorization header', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({ apiKey: 'sk-test', fetch: mockFetch });

    await provider.generate({ modelId: 'voxtral-mini-tts-2603', text: 'Hi' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer sk-test');
  });

  it('maps { audio: string } voice to ref_audio', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await provider.generate({
      modelId: 'voxtral-mini-tts-2603',
      text: 'Hello',
      voice: { audio: 'base64audiodata' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.ref_audio).toBe('base64audiodata');
    expect(body.voice_id).toBeUndefined();
  });

  it('maps { audio: Uint8Array } voice to base64 ref_audio', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    const audioBytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    await provider.generate({
      modelId: 'voxtral-mini-tts-2603',
      text: 'Hello',
      voice: { audio: audioBytes },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.ref_audio).toBe(btoa('Hello'));
    expect(body.voice_id).toBeUndefined();
  });

  it('sends no voice_id or ref_audio when voice is omitted', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    await provider.generate({ modelId: 'voxtral-mini-tts-2603', text: 'Hi' });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_id).toBeUndefined();
    expect(body.ref_audio).toBeUndefined();
  });

  it('returns base64 audio from JSON response', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({ apiKey: 'test-key', fetch: mockFetch });

    const result = await provider.generate({
      modelId: 'voxtral-mini-tts-2603',
      text: 'Hello',
    });

    expect(result.audio).toBe('dGVzdA==');
    expect(result.mediaType).toBe('audio/mpeg');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid_api_key"}',
    });

    const provider = new MistralSpeechProvider({ apiKey: 'bad-key', fetch: mockFetch });

    await expect(
      provider.generate({ modelId: 'voxtral-mini-tts-2603', text: 'Hello' }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = mockJsonResponse({ audio_data: 'dGVzdA==' });
    const provider = new MistralSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://custom.api.com/v1',
      fetch: mockFetch,
    });

    await provider.generate({ modelId: 'voxtral-mini-tts-2603', text: 'Hello' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://custom.api.com/v1/audio/speech');
  });
});
