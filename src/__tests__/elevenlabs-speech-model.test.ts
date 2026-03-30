import { describe, it, expect, vi } from 'vitest';
import { ElevenLabsSpeechProvider } from '../providers/elevenlabs/elevenlabs-speech-model.js';

describe('ElevenLabsSpeechProvider', () => {
  it('has correct id and defaultModel', () => {
    const provider = new ElevenLabsSpeechProvider({});
    expect(provider.id).toBe('elevenlabs');
    expect(provider.defaultModel).toBe('eleven_multilingual_v2');
  });

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

  it('maps providerOptions to request body with snake_case', async () => {
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
        voiceSettings: {
          stability: 0.5,
          similarityBoost: 0.8,
          useSpeakerBoost: true,
        },
        previousRequestIds: ['req-1', 'req-2'],
        previousText: 'previous paragraph',
        nextText: 'next paragraph',
        seed: 42,
        languageCode: 'en',
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_settings.stability).toBe(0.5);
    expect(body.voice_settings.similarity_boost).toBe(0.8);
    expect(body.voice_settings.use_speaker_boost).toBe(true);
    expect(body.previous_request_ids).toEqual(['req-1', 'req-2']);
    expect(body.previous_text).toBe('previous paragraph');
    expect(body.next_text).toBe('next paragraph');
    expect(body.seed).toBe(42);
    expect(body.language_code).toBe('en');
  });

  it('passes outputFormat as query parameter', async () => {
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
        outputFormat: 'mp3_44100_192',
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
