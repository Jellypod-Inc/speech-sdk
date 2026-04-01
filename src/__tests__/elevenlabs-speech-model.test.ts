import { describe, it, expect, vi } from 'vitest';
import { ElevenLabsSpeechProvider } from '../providers/elevenlabs/index.js';

describe('ElevenLabsSpeechProvider', () => {
  it('calls the correct URL with voice_id in path', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'request-id': 'req-abc-123',
      }),
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'eleven_multilingual_v2',
      text: 'Hello world',
      voice: 'voice-123',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('/v1/text-to-speech/voice-123');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body);
    expect(body.text).toBe('Hello world');
    expect(body.model_id).toBe('eleven_multilingual_v2');
  });

  it('sends xi-api-key header', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'request-id': 'req-123',
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'xi-test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'eleven_multilingual_v2',
      text: 'Hi',
      voice: 'v1',
    });

    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers['xi-api-key']).toBe('xi-test-key');
  });

  it('passes providerOptions through to request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'request-id': 'req-123',
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'eleven_multilingual_v2',
      text: 'Hello',
      voice: 'v1',
      providerOptions: {
        voice_settings: { stability: 0.5, similarity_boost: 0.8 },
        previous_request_ids: ['req-1', 'req-2'],
        seed: 42,
        language_code: 'en',
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_settings).toEqual({ stability: 0.5, similarity_boost: 0.8 });
    expect(body.previous_request_ids).toEqual(['req-1', 'req-2']);
    expect(body.seed).toBe(42);
    expect(body.language_code).toBe('en');
  });

  it('passes output_format as query parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'request-id': 'req-123',
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'eleven_multilingual_v2',
      text: 'Hello',
      voice: 'v1',
      providerOptions: {
        output_format: 'mp3_44100_192',
      },
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('output_format=mp3_44100_192');
  });

  it('returns requestId in providerMetadata', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'request-id': 'req-abc-456',
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: 'eleven_multilingual_v2',
      text: 'Hello',
      voice: 'v1',
    });

    expect(result.providerMetadata?.requestId).toBe('req-abc-456');
  });

  it('throws ApiError on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      headers: new Headers(),
      text: async () => '{"detail": "validation error"}',
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      fetch: mockFetch,
    });

    await expect(
      provider.generate({
        modelId: 'eleven_multilingual_v2',
        text: 'Hello',
        voice: 'v1',
      }),
    ).rejects.toThrow();
  });

  it('uses custom baseURL', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'request-id': 'req-123',
      }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      baseURL: 'https://my-proxy.com',
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: 'eleven_multilingual_v2',
      text: 'Hello',
      voice: 'v1',
    });

    const url = mockFetch.mock.calls[0][0] as string;
    expect(url).toContain('https://my-proxy.com/v1/text-to-speech/v1');
  });

  it('requires voice parameter', async () => {
    const provider = new ElevenLabsSpeechProvider({
      apiKey: 'test-key',
      fetch: vi.fn(),
    });

    await expect(
      provider.generate({
        modelId: 'eleven_multilingual_v2',
        text: 'Hello',
      }),
    ).rejects.toThrow('voice');
  });
});
