import { describe, expect, it, vi } from "vitest";
import { wrapPcm16Mono } from "../audio-utils.js";
import { generateSpeech } from "../generate-speech.js";
import {
  AssemblyAISpeechProvider,
  createAssemblyAI,
} from "../providers/assemblyai/index.js";
import { resolveModel } from "../resolve-provider.js";

async function wavResponse(sampleRate = 48_000) {
  const audio = await wrapPcm16Mono(new Uint8Array(960), sampleRate);
  return {
    audio,
    response: new Response(audio, {
      headers: {
        "Content-Type": "audio/wav",
        "X-Request-Id": "request-1",
        "X-TTS-Voice-Id": "aai-kyla",
        "X-TTS-Billed-Characters": "5",
        "X-TTS-Audio-Duration-Ms": "10",
      },
    }),
  };
}

function bodyOf(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  return JSON.parse(String(fetch.mock.calls[0][1]?.body));
}

describe("AssemblyAI speech", () => {
  it("requests a buffered WAV and keeps SDK-owned fields authoritative", async () => {
    const { audio, response } = await wavResponse();
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response);
    const signal = new AbortController().signal;
    const provider = new AssemblyAISpeechProvider({
      apiKey: "test-key",
      fetch,
    });
    const result = await provider.generate({
      modelId: "assemblyai-tts-1",
      text: "Hello",
      voice: "aai-audrey",
      providerOptions: {
        language: "english",
        text: "wrong",
        model_id: "wrong",
        stream: true,
      },
      headers: { "Custom-Header": "value" },
      abortSignal: signal,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://tts.us.assemblyai.com/v1/speech");
    expect(init?.signal).toBe(signal);
    expect(init?.headers).toMatchObject({
      Authorization: "test-key",
      "Custom-Header": "value",
    });
    expect(bodyOf(fetch)).toEqual({
      encoding: "pcm_s16le",
      container: "wav",
      language: "english",
      text: "Hello",
      model_id: "assemblyai-tts-1",
      stream: false,
      voice_id: "aai-audrey",
    });
    expect(result.audio).toEqual(audio);
    expect(result.mediaType).toBe("audio/wav");
    expect(result.audioDurationMs).toBe(10);
    expect(result.providerMetadata).toEqual({
      requestId: "request-1",
      voiceId: "aai-kyla",
      billedCharacters: "5",
    });
  });

  it("leaves the voice to AssemblyAI's per-language default when none is given", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce((await wavResponse()).response);
    await new AssemblyAISpeechProvider({ apiKey: "test", fetch }).generate({
      modelId: "assemblyai-tts-1",
      text: "Hello",
    });
    expect(bodyOf(fetch)).not.toHaveProperty("voice_id");
  });

  it("uses a custom baseURL for the EU zone", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce((await wavResponse()).response);
    await createAssemblyAI({
      apiKey: "test",
      baseURL: "https://tts.eu.assemblyai.com",
      fetch,
    })().provider.generate({ modelId: "assemblyai-tts-1", text: "Hello" });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://tts.eu.assemblyai.com/v1/speech"
    );
  });

  it("converts to PCM locally and requests native MP3", async () => {
    const pcmFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce((await wavResponse(24_000)).response);
    const pcm = await generateSpeech({
      model: createAssemblyAI({ apiKey: "test", fetch: pcmFetch })(),
      text: "Hello",
      output: { format: "pcm", sampleRate: 24_000 },
    });
    expect(bodyOf(pcmFetch)).toMatchObject({
      encoding: "pcm_s16le",
      container: "wav",
      sample_rate: 24_000,
    });
    expect(pcm.audio.mediaType).toBe("audio/pcm;rate=24000");
    expect(pcm.audio.uint8Array).toHaveLength(960);

    const mp3Fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
      new Response(new Uint8Array([0xff, 0xfb, 0x90, 0x00]), {
        headers: { "Content-Type": "audio/mpeg" },
      })
    );
    const mp3 = await generateSpeech({
      model: createAssemblyAI({ apiKey: "test", fetch: mp3Fetch })(),
      text: "Hello",
      output: { format: "mp3" },
    });
    expect(bodyOf(mp3Fetch)).toMatchObject({
      encoding: "mp3",
      container: "raw",
      sample_rate: 48_000,
      bit_rate: 96_000,
    });
    expect(mp3.audio.mediaType).toBe("audio/mpeg");
  });

  it.each([
    [undefined, 48_000, 96_000],
    [100, 44_100, 96_000],
    [128, 8000, 64_000],
    [20, 16_000, 32_000],
  ])("snaps an MP3 bitrate of %s kbps at %s Hz to %s bps", (bitrate, sampleRate, expected) => {
    const resolved = new AssemblyAISpeechProvider({}).resolveOutputFormat(
      "assemblyai-tts-1",
      { format: "mp3", bitrate, sampleRate }
    );
    expect(resolved?.providerOptions).toMatchObject({ bit_rate: expected });
  });

  it("strips bracket tags, which AssemblyAI would read aloud", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce((await wavResponse()).response);
    const result = await generateSpeech({
      model: createAssemblyAI({ apiKey: "test", fetch })(),
      text: "[laughs] Hello",
    });
    expect(bodyOf(fetch).text).toBe("Hello");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects empty audio and surfaces HTTP failures as provider errors", async () => {
    const emptyFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array()));
    await expect(
      new AssemblyAISpeechProvider({
        apiKey: "test",
        fetch: emptyFetch,
      }).generate({
        modelId: "assemblyai-tts-1",
        text: "Hello",
      })
    ).rejects.toMatchObject({
      name: "NoSpeechGeneratedError",
      retryable: true,
    });

    const busyFetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }));
    await expect(
      new AssemblyAISpeechProvider({
        apiKey: "test",
        fetch: busyFetch,
      }).generate({
        modelId: "assemblyai-tts-1",
        text: "Hello",
      })
    ).rejects.toMatchObject({
      name: "SpeechSdkProviderError",
      status: 503,
      provider: "assemblyai",
      model: "assemblyai-tts-1",
      stage: "synthesis",
      retryable: true,
    });
  });

  it("resolves strings and negotiates WAV for stitching", () => {
    expect(resolveModel("assemblyai").modelId).toBe("assemblyai-tts-1");
    expect(resolveModel("assemblyai/assemblyai-tts-1").provider.id).toBe(
      "assemblyai"
    );
    const provider = new AssemblyAISpeechProvider({});
    expect(provider.getStitchOptions("assemblyai-tts-1")).toEqual({
      providerOptions: {
        encoding: "pcm_s16le",
        container: "wav",
        sample_rate: 48_000,
      },
      mediaType: "audio/wav",
    });
    expect(
      provider.getStitchOptions("assemblyai-tts-1", { sampleRate: 22_050 })
        ?.providerOptions
    ).toMatchObject({ sample_rate: 22_050 });
    expect(() =>
      provider.getStitchOptions("assemblyai-tts-1", { sampleRate: 32_000 })
    ).toThrow();
    expect(provider.getStitchOptions("unknown")).toBeUndefined();
    expect(
      provider.resolveOutputFormat("unknown", { format: "mp3" })
    ).toBeUndefined();
  });
});
