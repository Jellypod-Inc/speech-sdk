import { describe, expect, it, vi } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { MiniMaxSpeechProvider } from "../providers/minimax/index.js";

function bytesToHex(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  };
}

const AUDIO_BYTES = [0x12, 0x34, 0xab, 0xcd];

function audioResponse(
  overrides: { format?: string; sampleRate?: number } = {}
) {
  return okResponse({
    data: { audio: bytesToHex(AUDIO_BYTES), status: 2 },
    extra_info: {
      audio_length: 1234,
      audio_sample_rate: overrides.sampleRate ?? 32_000,
      audio_format: overrides.format ?? "mp3",
    },
    base_resp: { status_code: 0, status_msg: "success" },
    trace_id: "trace-abc",
  });
}

describe("MiniMaxSpeechProvider", () => {
  it("calls the t2a_v2 endpoint for the default model", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "speech-2.8-hd", text: "Hello world" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.minimax.io/v1/t2a_v2");
    expect(init.method).toBe("POST");
  });

  it("appends GroupId query param when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      groupId: "grp 123",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "speech-2.8-hd", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.minimax.io/v1/t2a_v2?GroupId=grp%20123");
  });

  it("builds the nested body with model, text, and hex output", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "speech-2.8-turbo",
      text: "Hello",
      voice: "Friendly_Person",
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("speech-2.8-turbo");
    expect(body.text).toBe("Hello");
    expect(body.stream).toBe(false);
    expect(body.output_format).toBe("hex");
    expect(body.voice_setting.voice_id).toBe("Friendly_Person");
    expect(body.audio_setting.format).toBe("mp3");
  });

  it("falls back to the default voice when none is provided", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "speech-2.8-hd", text: "Hello" });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.voice_setting.voice_id).toBe("Wise_Woman");
  });

  it("merges nested voice_setting/audio_setting from providerOptions", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await provider.generate({
      modelId: "speech-2.8-hd",
      text: "Hello",
      voice: "Calm_Woman",
      providerOptions: {
        voice_setting: { speed: 1.2, vol: 2 },
        audio_setting: { format: "flac", sample_rate: 44_100 },
        language_boost: "English",
      },
    });

    const [, init] = mockFetch.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.voice_setting).toEqual({
      voice_id: "Calm_Woman",
      speed: 1.2,
      vol: 2,
    });
    expect(body.audio_setting).toEqual({ format: "flac", sample_rate: 44_100 });
    expect(body.language_boost).toBe("English");
  });

  it("sends Bearer auth header and SDK user agent", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "sk-minimax-1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "speech-2.8-hd", text: "Hi" });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer sk-minimax-1");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("decodes hex audio and derives mediaType from extra_info", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "speech-2.8-hd",
      text: "Hello",
    });

    expect(Array.from(result.audio)).toEqual(AUDIO_BYTES);
    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.audioDurationMs).toBe(1234);
  });

  it("returns audio/pcm;rate=<hz> for raw pcm responses", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue(audioResponse({ format: "pcm", sampleRate: 44_100 }));
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    const result = await provider.generate({
      modelId: "speech-2.8-hd",
      text: "Hello",
      providerOptions: {
        audio_setting: { format: "pcm", sample_rate: 44_100 },
      },
    });

    expect(result.mediaType).toBe("audio/pcm;rate=44100");
  });

  it("throws when base_resp signals a logical error", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      okResponse({
        data: {},
        base_resp: { status_code: 1004, status_msg: "invalid api key" },
      })
    );
    const provider = new MiniMaxSpeechProvider({
      apiKey: "bad-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "speech-2.8-hd", text: "Hello" })
    ).rejects.toThrow("MiniMax T2A error 1004");
  });

  it("throws when the response carries no audio", async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      okResponse({
        data: { status: 2 },
        base_resp: { status_code: 0, status_msg: "success" },
      })
    );
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "speech-2.8-hd", text: "Hello" })
    ).rejects.toThrow("no audio data");
  });

  it("throws on a non-2xx HTTP response", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: async () => "internal error",
    });
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      fetch: mockFetch,
    });

    await expect(
      provider.generate({ modelId: "speech-2.8-hd", text: "Hello" })
    ).rejects.toThrow();
  });

  it("uses a custom baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue(audioResponse());
    const provider = new MiniMaxSpeechProvider({
      apiKey: "test-key",
      baseURL: "https://api-uw.minimax.io/v1",
      fetch: mockFetch,
    });

    await provider.generate({ modelId: "speech-2.8-hd", text: "Hello" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api-uw.minimax.io/v1/t2a_v2");
  });

  describe("supportedSampleRates", () => {
    it("publishes the documented set for known models", () => {
      const provider = new MiniMaxSpeechProvider({ apiKey: "test" });
      expect(provider.supportedSampleRates("speech-2.8-hd")).toEqual([
        8000, 16_000, 22_050, 24_000, 32_000, 44_100,
      ]);
    });

    it("returns an empty array for unknown models", () => {
      const provider = new MiniMaxSpeechProvider({ apiKey: "test" });
      expect(provider.supportedSampleRates("unknown")).toEqual([]);
    });
  });

  describe("getStitchOptions", () => {
    it("returns pcm at the highest supported rate by default", () => {
      const provider = new MiniMaxSpeechProvider({ apiKey: "test" });
      expect(provider.getStitchOptions("speech-2.8-hd")).toEqual({
        providerOptions: {
          audio_setting: { format: "pcm", sample_rate: 44_100, channel: 1 },
        },
        mediaType: "audio/pcm;rate=44100",
      });
    });

    it("honors a supported sampleRate hint", () => {
      const provider = new MiniMaxSpeechProvider({ apiKey: "test" });
      expect(
        provider.getStitchOptions("speech-2.8-hd", { sampleRate: 24_000 })
      ).toEqual({
        providerOptions: {
          audio_setting: { format: "pcm", sample_rate: 24_000, channel: 1 },
        },
        mediaType: "audio/pcm;rate=24000",
      });
    });

    it("throws on an unsupported sampleRate hint", () => {
      const provider = new MiniMaxSpeechProvider({ apiKey: "test" });
      expect(() =>
        provider.getStitchOptions("speech-2.8-hd", { sampleRate: 48_000 })
      ).toThrow(UnsupportedSampleRateError);
    });

    it("returns undefined for unknown models", () => {
      const provider = new MiniMaxSpeechProvider({ apiKey: "test" });
      expect(provider.getStitchOptions("unknown")).toBeUndefined();
    });
  });

  describe("resolveOutputFormat", () => {
    const provider = new MiniMaxSpeechProvider({ apiKey: "test" });

    it("requests decodable pcm for wav output", () => {
      expect(
        provider.resolveOutputFormat("speech-2.8-hd", { format: "wav" })
      ).toEqual({
        providerOptions: {
          audio_setting: { format: "pcm", sample_rate: 44_100, channel: 1 },
        },
        expectedMediaType: "audio/pcm;rate=44100",
      });
    });

    it("requests pcm for pcm output", () => {
      expect(
        provider.resolveOutputFormat("speech-2.8-hd", {
          format: "pcm",
          sampleRate: 24_000,
        })
      ).toEqual({
        providerOptions: {
          audio_setting: { format: "pcm", sample_rate: 24_000, channel: 1 },
        },
        expectedMediaType: "audio/pcm;rate=24000",
      });
    });

    it("maps mp3 bitrate to the nearest MiniMax option (bps)", () => {
      expect(
        provider.resolveOutputFormat("speech-2.8-hd", {
          format: "mp3",
          bitrate: 130,
        })
      ).toEqual({
        providerOptions: {
          audio_setting: {
            format: "mp3",
            sample_rate: 44_100,
            bitrate: 128_000,
          },
        },
        expectedMediaType: "audio/mpeg",
      });
    });

    it("throws on an unsupported sampleRate", () => {
      expect(() =>
        provider.resolveOutputFormat("speech-2.8-hd", {
          format: "pcm",
          sampleRate: 48_000,
        })
      ).toThrow(UnsupportedSampleRateError);
    });

    it("returns undefined for unknown models", () => {
      expect(
        provider.resolveOutputFormat("unknown", { format: "wav" })
      ).toBeUndefined();
    });
  });
});
