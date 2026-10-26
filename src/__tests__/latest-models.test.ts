import { describe, expect, it, vi } from "vitest";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";
import { GradiumSpeechProvider } from "../providers/gradium/index.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";
import { MistralSpeechProvider } from "../providers/mistral/index.js";
import { SpeechifySpeechProvider } from "../providers/speechify/index.js";

describe("current model negotiation", () => {
  const cases = [
    {
      provider: new GradiumSpeechProvider({}),
      modelId: "gradium-tts-beta",
      stitch: [{ output_format: "pcm_48000" }, "audio/pcm;rate=48000"],
      wav: [{ output_format: "wav" }, "audio/wav"],
      pcm: [{ output_format: "pcm_48000" }, "audio/pcm;rate=48000"],
      mp3: [{ output_format: "pcm_48000" }, "audio/pcm;rate=48000"],
    },
    {
      provider: new ElevenLabsSpeechProvider({}),
      modelId: "eleven_v4",
      stitch: [{ output_format: "pcm_48000" }, "audio/pcm;rate=48000"],
      wav: [{ output_format: "pcm_48000" }, "audio/pcm;rate=48000"],
      pcm: [{ output_format: "pcm_48000" }, "audio/pcm;rate=48000"],
      mp3: [{ output_format: "mp3_44100_96" }, "audio/mpeg"],
    },
    {
      provider: new CartesiaSpeechProvider({}),
      modelId: "sonic-3.6",
      stitch: [
        {
          output_format: {
            container: "wav",
            encoding: "pcm_s16le",
            sample_rate: 48_000,
          },
        },
        "audio/wav",
      ],
      wav: [
        {
          output_format: {
            container: "wav",
            encoding: "pcm_s16le",
            sample_rate: 48_000,
          },
        },
        "audio/wav",
      ],
      pcm: [
        {
          output_format: {
            container: "raw",
            encoding: "pcm_s16le",
            sample_rate: 48_000,
          },
        },
        "audio/pcm;rate=48000",
      ],
      mp3: [
        {
          output_format: {
            container: "mp3",
            bit_rate: 96_000,
            sample_rate: 48_000,
          },
        },
        "audio/mpeg",
      ],
    },
    {
      provider: new InworldSpeechProvider({}),
      modelId: "inworld-tts-2-flash",
      stitch: [
        {
          audio_config: {
            audio_encoding: "LINEAR16",
            sample_rate_hertz: 48_000,
          },
        },
        "audio/wav",
      ],
      wav: [
        {
          audio_config: {
            audio_encoding: "LINEAR16",
            sample_rate_hertz: 48_000,
          },
        },
        "audio/wav",
      ],
      pcm: [
        {
          audio_config: {
            audio_encoding: "LINEAR16",
            sample_rate_hertz: 48_000,
          },
        },
        "audio/wav",
      ],
      mp3: [
        { audio_config: { audio_encoding: "MP3", sample_rate_hertz: 48_000 } },
        "audio/mpeg",
      ],
    },
    {
      provider: new FishAudioSpeechProvider({}),
      modelId: "s2.1-pro",
      stitch: [{ format: "wav", sample_rate: 44_100 }, "audio/wav"],
      wav: [{ format: "wav", sample_rate: 44_100 }, "audio/wav"],
      pcm: [{ format: "wav", sample_rate: 44_100 }, "audio/wav"],
      mp3: [{ format: "mp3", sample_rate: 44_100 }, "audio/mpeg"],
    },
    {
      provider: new FishAudioSpeechProvider({}),
      modelId: "s2.1-pro-free",
      stitch: [{ format: "wav", sample_rate: 44_100 }, "audio/wav"],
      wav: [{ format: "wav", sample_rate: 44_100 }, "audio/wav"],
      pcm: [{ format: "wav", sample_rate: 44_100 }, "audio/wav"],
      mp3: [{ format: "mp3", sample_rate: 44_100 }, "audio/mpeg"],
    },
    {
      provider: new SpeechifySpeechProvider({}),
      modelId: "simba-3.5",
      stitch: [{ audio_format: "wav" }, "audio/wav"],
      wav: [{ audio_format: "wav" }, "audio/wav"],
      pcm: [{ audio_format: "wav" }, "audio/wav"],
      mp3: [{ audio_format: "mp3" }, "audio/mpeg"],
    },
    {
      provider: new SpeechifySpeechProvider({}),
      modelId: "simba-3.2",
      stitch: [{ audio_format: "wav" }, "audio/wav"],
      wav: [{ audio_format: "wav" }, "audio/wav"],
      pcm: [{ audio_format: "wav" }, "audio/wav"],
      mp3: [{ audio_format: "mp3" }, "audio/mpeg"],
    },
    {
      provider: new MistralSpeechProvider({}),
      modelId: "voxtral-mini-tts-3-0",
      stitch: [{ response_format: "wav" }, "audio/wav"],
      wav: [{ response_format: "wav" }, "audio/wav"],
      pcm: [{ response_format: "wav" }, "audio/wav"],
      mp3: [{ response_format: "mp3" }, "audio/mpeg"],
    },
    {
      provider: new DeepgramSpeechProvider({}),
      modelId: "flux",
      stitch: [
        { encoding: "linear16", sample_rate: 48_000, container: "wav" },
        "audio/wav",
      ],
      wav: [
        { encoding: "linear16", container: "wav", sample_rate: 48_000 },
        "audio/wav",
      ],
      pcm: [
        { encoding: "linear16", container: "wav", sample_rate: 48_000 },
        "audio/wav",
      ],
      mp3: [{ encoding: "mp3" }, "audio/mpeg"],
    },
  ] as const;

  it.each(cases)("negotiates decodable output for $provider.id/$modelId", ({
    provider,
    modelId,
    stitch,
    wav,
    pcm,
    mp3,
  }) => {
    expect(provider.models.some((model) => model.id === modelId)).toBe(true);
    expect(provider.getStitchOptions(modelId)).toEqual({
      providerOptions: stitch[0],
      mediaType: stitch[1],
    });
    for (const [format, [providerOptions, expectedMediaType]] of [
      ["wav", wav],
      ["pcm", pcm],
      ["mp3", mp3],
    ] as const) {
      expect(provider.resolveOutputFormat(modelId, { format })).toEqual({
        providerOptions,
        expectedMediaType,
      });
    }
  });

  it("routes Flux requests to Deepgram v2 and keeps Aura on v1", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(
      async () =>
        new Response(new Uint8Array([1, 2]), {
          headers: { "content-type": "audio/mpeg" },
        })
    );
    const provider = new DeepgramSpeechProvider({ apiKey: "test", fetch });
    await provider.generate({
      modelId: "flux",
      text: "Hello",
      voice: "alexis-en",
    });
    await provider.generate({
      modelId: "aura-2",
      text: "Hello",
      voice: "thalia-en",
    });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.deepgram.com/v2/speak?model=flux-alexis-en"
    );
    expect(fetch.mock.calls[1][0]).toBe(
      "https://api.deepgram.com/v1/speak?model=aura-2-thalia-en"
    );
  });

  it("rejects Flux when the baseURL cannot be routed to v2", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const provider = new DeepgramSpeechProvider({
      apiKey: "test",
      baseURL: "https://proxy.example.com/deepgram",
      fetch,
    });
    await expect(
      provider.generate({ modelId: "flux", text: "Hello", voice: "alexis-en" })
    ).rejects.toThrow("baseURL must end in /v1");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends Fish S2.1 Pro to native dialogue", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: { "content-type": "audio/mpeg" },
      })
    );
    const provider = new FishAudioSpeechProvider({ apiKey: "test", fetch });
    expect(provider.dialogueCapabilities("s2.1-pro")).toEqual({
      maxVoices: 4,
    });
    expect(provider.dialogueCapabilities("s2.1-pro-free")).toBeUndefined();
    await provider.generateDialogue({
      modelId: "s2.1-pro",
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "Hi" },
      ],
    });
    const init = fetch.mock.calls[0][1];
    expect(init?.headers).toMatchObject({ model: "s2.1-pro" });
    expect(JSON.parse(String(init?.body)).reference_id).toEqual(["a", "b"]);
  });

  it("sends Eleven v4 to the native dialogue endpoint", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(new Uint8Array([1]), {
        headers: { "content-type": "audio/mpeg" },
      })
    );
    const provider = new ElevenLabsSpeechProvider({ apiKey: "test", fetch });
    expect(provider.dialogueCapabilities("eleven_v4")).toEqual({
      maxVoices: 10,
      maxTotalChars: 2000,
    });
    await provider.generateDialogue({
      modelId: "eleven_v4",
      turns: [{ voice: "voice", text: "Hello" }],
    });
    expect(fetch.mock.calls[0][0]).toBe(
      "https://api.elevenlabs.io/v1/text-to-dialogue"
    );
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).model_id).toBe(
      "eleven_v4"
    );
  });
});
