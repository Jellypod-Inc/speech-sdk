import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { SpeechifySpeechProvider } from "../providers/speechify/index.js";

function jsonResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

describe("SpeechifySpeechProvider", () => {
  it("posts to /audio/speech with bearer auth and decodes base64 audio", async () => {
    const audioBytes = new Uint8Array([1, 2, 3, 4]);
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        audio_data: uint8ArrayToBase64(audioBytes),
        audio_format: "wav",
      })
    );

    const provider = new SpeechifySpeechProvider({
      apiKey: "speechify-test",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "simba-english",
      text: "Your briefing is ready.",
      voice: "george",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.speechify.ai/v1/audio/speech");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer speechify-test");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(JSON.parse(init.body)).toEqual({
      audio_format: "wav",
      input: "Your briefing is ready.",
      voice_id: "george",
      model: "simba-english",
    });

    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio).toEqual(audioBytes);
  });

  it("passes providerOptions through with native Speechify field names", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        audio_data: uint8ArrayToBase64(new Uint8Array([9])),
        audio_format: "mp3",
      })
    );
    const provider = new SpeechifySpeechProvider({
      apiKey: "test",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "simba-multilingual",
      text: "Hola",
      voice: "carly",
      providerOptions: {
        audio_format: "mp3",
        language: "es-ES",
        loudness_normalization: true,
      },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      audio_format: "mp3",
      language: "es-ES",
      loudness_normalization: true,
      input: "Hola",
      voice_id: "carly",
      model: "simba-multilingual",
    });
    expect(result.mediaType).toBe("audio/mpeg");
  });

  it("does not let providerOptions override input, voice, or model", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ audio_data: uint8ArrayToBase64(new Uint8Array([1])) })
      );
    const provider = new SpeechifySpeechProvider({
      apiKey: "test",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "simba-english",
      text: "real text",
      voice: "real-voice",
      providerOptions: {
        input: "hijacked",
        voice_id: "hijacked",
        model: "hijacked",
      },
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      input: "real text",
      voice_id: "real-voice",
      model: "simba-english",
    });
  });

  it("derives media type from the response audio_format", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      jsonResponse({
        audio_data: uint8ArrayToBase64(new Uint8Array([1])),
        audio_format: "ogg",
      })
    );
    const provider = new SpeechifySpeechProvider({
      apiKey: "test",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    const result = await provider.generate({
      modelId: "simba-english",
      text: "Hi",
      voice: "george",
    });

    expect(result.mediaType).toBe("audio/ogg");
  });

  it("uses a custom baseURL", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ audio_data: uint8ArrayToBase64(new Uint8Array([1])) })
      );
    const provider = new SpeechifySpeechProvider({
      apiKey: "test",
      baseURL: "https://proxy.example/v1",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "simba-english",
      text: "Hi",
      voice: "george",
    });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://proxy.example/v1/audio/speech");
  });

  it("requires a Speechify voice id", async () => {
    const provider = new SpeechifySpeechProvider({
      apiKey: "test",
      fetch: vi.fn() as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({ modelId: "simba-english", text: "Hello" })
    ).rejects.toThrow('"voice" is required');
  });

  it("throws on error response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => '{"error": "invalid api key"}',
    });
    const provider = new SpeechifySpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await expect(
      provider.generate({
        modelId: "simba-english",
        text: "Hello",
        voice: "george",
      })
    ).rejects.toThrow("API error 401");
  });
});
