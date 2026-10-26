import { describe, expect, it, vi } from "vitest";
import { wrapPcm16Mono } from "../audio-utils.js";
import { generateSpeech } from "../generate-speech.js";
import {
  createHeyGen,
  HeyGenSpeechProvider,
} from "../providers/heygen/index.js";
import { resolveModel } from "../resolve-provider.js";

async function setup() {
  const audio = await wrapPcm16Mono(new Uint8Array(882), 44_100);
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(
      Response.json(
        {
          data: {
            audio_url: "https://files.heygen.ai/speech.wav",
            duration: 0.01,
          },
        },
        { headers: { "X-Request-Id": "request-1" } }
      )
    )
    .mockResolvedValueOnce(
      new Response(audio, { headers: { "Content-Type": "audio/wav" } })
    );
  return { audio, fetch };
}

describe("HeyGen speech", () => {
  it.each([
    "heygen-voice-1",
    "heygen-voice-1-turbo",
    "heygen-voice-1-turbo-free",
  ])("synthesizes %s and downloads the WAV without forwarding credentials", async (modelId) => {
    const { audio, fetch } = await setup();
    const signal = new AbortController().signal;
    const provider = new HeyGenSpeechProvider({ apiKey: "test-key", fetch });
    const result = await provider.generate({
      modelId,
      text: "Hello",
      voice: "public-voice",
      providerOptions: {
        expressiveness_boost: 0.5,
        model: "wrong",
        text: "wrong",
        voice_id: "wrong",
      },
      headers: { "Custom-Header": "value" },
      abortSignal: signal,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.heygen.com/v3/models/audio/tts");
    expect(init?.headers).toMatchObject({
      "X-Api-Key": "test-key",
      "Custom-Header": "value",
    });
    expect(JSON.parse(String(init?.body))).toEqual({
      model: modelId,
      text: "Hello",
      voice_id: "public-voice",
      expressiveness_boost: 0.5,
    });
    expect(fetch.mock.calls[1]).toEqual([
      "https://files.heygen.ai/speech.wav",
      { signal },
    ]);
    expect(result.audio).toEqual(audio);
    expect(result.audioDurationMs).toBe(10);
    expect(result.mediaType).toBe("audio/wav");
    expect(result.providerMetadata.requestId).toBe("request-1");
  });

  it("supports output conversion through the public API", async () => {
    const { fetch } = await setup();
    const result = await generateSpeech({
      model: createHeyGen({ apiKey: "test", fetch })(),
      text: "Hello",
      voice: "public-voice",
      output: { format: "pcm" },
    });
    expect(result.audio.mediaType).toBe("audio/pcm;rate=44100");
    expect(result.audio.uint8Array).toHaveLength(882);
  });

  it("rejects malformed payloads and empty audio", async () => {
    const malformedFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ data: {} }));
    await expect(
      new HeyGenSpeechProvider({
        apiKey: "test",
        fetch: malformedFetch,
      }).generate({ modelId: "heygen-voice-1", text: "Hello", voice: "voice" })
    ).rejects.toThrow();
    expect(malformedFetch).toHaveBeenCalledTimes(1);

    const emptyFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: { audio_url: "https://files.heygen.ai/speech.wav" },
        })
      )
      .mockResolvedValueOnce(new Response(new Uint8Array()));
    await expect(
      new HeyGenSpeechProvider({ apiKey: "test", fetch: emptyFetch }).generate({
        modelId: "heygen-voice-1",
        text: "Hello",
        voice: "voice",
      })
    ).rejects.toMatchObject({
      name: "NoSpeechGeneratedError",
      retryable: true,
    });
  });

  it("requires a voice before making a request", async () => {
    const { fetch } = await setup();
    await expect(
      new HeyGenSpeechProvider({ apiKey: "test", fetch }).generate({
        modelId: "heygen-voice-1",
        text: "Hello",
      })
    ).rejects.toThrow("requires an active");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    ["synthesis", 503, true],
    ["download", 403, false],
  ] as const)("surfaces %s HTTP failures as provider errors", async (stage, status, retryable) => {
    const { fetch } = await setup();
    if (stage === "synthesis") {
      fetch
        .mockReset()
        .mockResolvedValueOnce(new Response("busy", { status: 503 }));
    } else {
      fetch
        .mockReset()
        .mockResolvedValueOnce(
          Response.json({
            data: { audio_url: "https://files.heygen.ai/speech.wav" },
          })
        )
        .mockResolvedValueOnce(new Response("expired", { status: 403 }));
    }
    await expect(
      new HeyGenSpeechProvider({ apiKey: "test", fetch }).generate({
        modelId: "heygen-voice-1",
        text: "Hello",
        voice: "voice",
      })
    ).rejects.toMatchObject({
      name: "SpeechSdkProviderError",
      status,
      provider: "heygen",
      model: "heygen-voice-1",
      stage: "synthesis",
      retryable,
    });
  });

  it("resolves strings and negotiates fixed-rate WAV for stitching and conversion", () => {
    expect(resolveModel("heygen").modelId).toBe("heygen-voice-1");
    expect(resolveModel("heygen/heygen-voice-1-turbo").provider.id).toBe(
      "heygen"
    );
    const provider = new HeyGenSpeechProvider({});
    expect(provider.getStitchOptions("heygen-voice-1")).toEqual({
      providerOptions: {},
      mediaType: "audio/wav",
    });
    expect(
      provider.resolveOutputFormat("heygen-voice-1", { format: "mp3" })
    ).toEqual({ providerOptions: {}, expectedMediaType: "audio/wav" });
    expect(() =>
      provider.getStitchOptions("heygen-voice-1", { sampleRate: 24_000 })
    ).toThrow();
    expect(provider.getStitchOptions("unknown")).toBeUndefined();
    expect(provider.models.every((model) => model.features.length === 0)).toBe(
      true
    );
  });
});
