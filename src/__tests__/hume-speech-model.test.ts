import { describe, it, expect, vi } from 'vitest';
import { HumeSpeechProvider } from '../providers/hume/hume-speech-model.js';

describe('HumeSpeechProvider', () => {
  function createMockFetch() {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/mpeg' }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });
  }

  it('calls the correct URL', async () => {
    const mockFetch = createMockFetch();

    const provider = new HumeSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'octave-2',
      text: 'Hello',
      voice: 'Kora',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.hume.ai/v0/tts/file');
  });

  it('sends X-Hume-Api-Key header', async () => {
    const mockFetch = createMockFetch();

    const provider = new HumeSpeechProvider({
      apiKey: 'hume-test-123',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'octave-2',
      text: 'Hello',
      voice: 'Kora',
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['X-Hume-Api-Key']).toBe('hume-test-123');
  });

  it('wraps text and voice in utterances array', async () => {
    const mockFetch = createMockFetch();

    const provider = new HumeSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'octave-2',
      text: 'Hello world',
      voice: 'Kora',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.utterances).toEqual([
      { text: 'Hello world', voice: { name: 'Kora' } },
    ]);
  });

  it('returns binary audio response', async () => {
    const audioData = new Uint8Array([10, 20, 30]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'audio/wav' }),
      arrayBuffer: async () => audioData.buffer,
    });

    const provider = new HumeSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'octave-2',
      text: 'Hello',
      voice: 'Kora',
    });

    expect(new Uint8Array(result.audio as Uint8Array)).toEqual(audioData);
    expect(result.mediaType).toBe('audio/wav');
  });

  it('throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "unauthorized"}',
    });

    const provider = new HumeSpeechProvider({
      apiKey: 'bad-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: 'octave-2', text: 'Hello', voice: 'Kora' }),
    ).rejects.toThrow();
  });

  it('sends utterance without voice when voice is not provided', async () => {
    const mockFetch = createMockFetch();

    const provider = new HumeSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'octave-2',
      text: 'Hello',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.utterances).toEqual([{ text: 'Hello' }]);
  });

  it('spreads providerOptions into body', async () => {
    const mockFetch = createMockFetch();

    const provider = new HumeSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'octave-2',
      text: 'Hello',
      voice: 'Kora',
      providerOptions: { format: 'wav' },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.format).toBe('wav');
  });

  it('uses custom baseURL', async () => {
    const mockFetch = createMockFetch();

    const provider = new HumeSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com/v0',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'octave-2',
      text: 'Hello',
      voice: 'Kora',
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('https://my-proxy.com/v0/tts/file');
  });
});
