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
    [new GradiumSpeechProvider({}), "gradium-tts-beta"],
    [new ElevenLabsSpeechProvider({}), "eleven_v4"],
    [new CartesiaSpeechProvider({}), "sonic-3.6"],
    [new InworldSpeechProvider({}), "inworld-tts-2-flash"],
    [new FishAudioSpeechProvider({}), "s2.1-pro"],
    [new FishAudioSpeechProvider({}), "s2.1-pro-free"],
    [new SpeechifySpeechProvider({}), "simba-3.5"],
    [new SpeechifySpeechProvider({}), "simba-3.2"],
    [new MistralSpeechProvider({}), "voxtral-mini-tts-3-0"],
    [new DeepgramSpeechProvider({}), "flux"],
  ] as const;

  it.each(
    cases
  )("negotiates decodable output for $0.id/$1", (provider, modelId) => {
    expect(provider.models.some((model) => model.id === modelId)).toBe(true);
    expect(provider.getStitchOptions(modelId)).toBeDefined();
    expect(
      provider.resolveOutputFormat(modelId, { format: "wav" })
    ).toBeDefined();
    expect(
      provider.resolveOutputFormat(modelId, { format: "pcm" })
    ).toBeDefined();
    expect(
      provider.resolveOutputFormat(modelId, { format: "mp3" })
    ).toBeDefined();
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
