import { afterEach, describe, expect, it, vi } from "vitest";
import { wrapPcm16Mono } from "../audio-utils.js";
import { generateSpeech } from "../generate-speech.js";
import {
  createMicrosoft,
  MicrosoftSpeechProvider,
} from "../providers/microsoft/index.js";
import { resolveModel } from "../resolve-provider.js";

async function wavFetch(sampleRate = 24_000) {
  const audio = await wrapPcm16Mono(new Uint8Array(480), sampleRate);
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(
    new Response(audio, {
      headers: { "Content-Type": "audio/x-wav", "X-RequestId": "request-1" },
    })
  );
  return { audio, fetch };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Microsoft MAI-Voice speech", () => {
  it("posts escaped SSML with the model's voice suffix to the region endpoint", async () => {
    const { audio, fetch } = await wavFetch();
    const signal = new AbortController().signal;
    const provider = new MicrosoftSpeechProvider({
      apiKey: "test-key",
      region: "eastus",
      fetch,
    });
    const result = await provider.generate({
      modelId: "mai-voice-2.1",
      text: `Tom & Jerry say "<hi>"`,
      voice: "es-MX-Valeria",
      headers: { "Custom-Header": "value" },
      abortSignal: signal,
    });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(
      "https://eastus.tts.speech.microsoft.com/cognitiveservices/v1"
    );
    expect(init?.signal).toBe(signal);
    expect(init?.headers).toMatchObject({
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
      "Ocp-Apim-Subscription-Key": "test-key",
      "Custom-Header": "value",
    });
    expect(init?.body).toBe(
      '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="http://www.w3.org/2001/mstts" xml:lang="es-MX"><voice name="es-MX-Valeria:MAI-Voice-2.1">Tom &amp; Jerry say &quot;&lt;hi&gt;&quot;</voice></speak>'
    );
    expect(result.audio).toEqual(audio);
    expect(result.mediaType).toBe("audio/wav");
    expect(result.providerMetadata).toEqual({
      requestId: "request-1",
      voice: "es-MX-Valeria:MAI-Voice-2.1",
    });
  });

  it("defaults to Harper on Flash, keeps full voice names and wraps styles", async () => {
    const first = await wavFetch();
    await createMicrosoft({
      apiKey: "test",
      region: "westus",
      fetch: first.fetch,
    })().provider.generate({ modelId: "mai-voice-2.1-flash", text: "Hello" });
    expect(String(first.fetch.mock.calls[0][1]?.body)).toContain(
      '<voice name="en-US-Harper:MAI-Voice-2.1-Flash">Hello</voice>'
    );

    const second = await wavFetch();
    await new MicrosoftSpeechProvider({
      apiKey: "test",
      region: "westus",
      fetch: second.fetch,
    }).generate({
      modelId: "mai-voice-2.1",
      text: "Great news!",
      voice: "en-US-Harper:MAI-Voice-2.1-Flash",
      providerOptions: { style: "joyful", styleDegree: 1.5 },
    });
    expect(String(second.fetch.mock.calls[0][1]?.body)).toContain(
      '<voice name="en-US-Harper:MAI-Voice-2.1-Flash"><mstts:express-as style="joyful" styledegree="1.5">Great news!</mstts:express-as></voice>'
    );
  });

  it("reads key and region from the environment, or uses a custom domain", async () => {
    vi.stubEnv("AZURE_SPEECH_KEY", "env-key");
    vi.stubEnv("AZURE_SPEECH_REGION", "swedencentral");
    const envCall = await wavFetch();
    await new MicrosoftSpeechProvider({ fetch: envCall.fetch }).generate({
      modelId: "mai-voice-2.1",
      text: "Hello",
    });
    expect(envCall.fetch.mock.calls[0][0]).toBe(
      "https://swedencentral.tts.speech.microsoft.com/cognitiveservices/v1"
    );
    expect(envCall.fetch.mock.calls[0][1]?.headers).toMatchObject({
      "Ocp-Apim-Subscription-Key": "env-key",
    });

    const domainCall = await wavFetch();
    await new MicrosoftSpeechProvider({
      apiKey: "test",
      baseURL: "https://my-speech.cognitiveservices.azure.com/",
      fetch: domainCall.fetch,
    }).generate({ modelId: "mai-voice-2.1", text: "Hello" });
    expect(domainCall.fetch.mock.calls[0][0]).toBe(
      "https://my-speech.cognitiveservices.azure.com/cognitiveservices/v1"
    );
  });

  it("requires a region and a known model before making a request", async () => {
    vi.stubEnv("AZURE_SPEECH_REGION", "");
    const { fetch } = await wavFetch();
    await expect(
      new MicrosoftSpeechProvider({ apiKey: "test", fetch }).generate({
        modelId: "mai-voice-2.1",
        text: "Hello",
      })
    ).rejects.toThrow("AZURE_SPEECH_REGION");
    await expect(
      new MicrosoftSpeechProvider({
        apiKey: "test",
        region: "eastus",
        fetch,
      }).generate({ modelId: "mai-voice-2", text: "Hello" })
    ).rejects.toThrow("not a known MAI-Voice model");
    await expect(
      new MicrosoftSpeechProvider({
        apiKey: "test",
        region: "eastus",
        fetch,
      }).generate({ modelId: "constructor", text: "Hello" })
    ).rejects.toThrow("not a known MAI-Voice model");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("strips bracket tags and converts WAV to PCM through the public API", async () => {
    const { fetch } = await wavFetch(22_050);
    const result = await generateSpeech({
      model: createMicrosoft({ apiKey: "test", region: "eastus", fetch })(),
      text: "[laughs] Hello",
      output: { format: "pcm", sampleRate: 22_050 },
    });
    const init = fetch.mock.calls[0][1];
    expect(init?.headers).toMatchObject({
      "X-Microsoft-OutputFormat": "riff-22050hz-16bit-mono-pcm",
    });
    expect(String(init?.body)).toContain(">Hello</voice>");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.audio.mediaType).toBe("audio/pcm;rate=22050");
    expect(result.audio.uint8Array).toHaveLength(480);
  });

  it.each([
    [{ format: "mp3" }, "audio-24khz-96kbitrate-mono-mp3"],
    [{ format: "mp3", bitrate: 150 }, "audio-24khz-160kbitrate-mono-mp3"],
    [
      { format: "mp3", sampleRate: 48_000, bitrate: 320 },
      "audio-48khz-192kbitrate-mono-mp3",
    ],
    [
      { format: "mp3", sampleRate: 16_000, bitrate: 32 },
      "audio-16khz-32kbitrate-mono-mp3",
    ],
    [{ format: "wav" }, "riff-24khz-16bit-mono-pcm"],
    [{ format: "wav", sampleRate: 48_000 }, "riff-48khz-16bit-mono-pcm"],
  ] as const)("maps %o to %s", (output, outputFormat) => {
    const resolved = new MicrosoftSpeechProvider({}).resolveOutputFormat(
      "mai-voice-2.1",
      output
    );
    expect(resolved).toEqual({
      providerOptions: { outputFormat },
      expectedMediaType: outputFormat.includes("mp3")
        ? "audio/mpeg"
        : "audio/wav",
    });
  });

  it("surfaces HTTP failures and empty audio as SDK errors", async () => {
    const throttled = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("slow down", { status: 429 }));
    await expect(
      new MicrosoftSpeechProvider({
        apiKey: "test",
        region: "eastus",
        fetch: throttled,
      }).generate({ modelId: "mai-voice-2.1", text: "Hello" })
    ).rejects.toMatchObject({
      name: "SpeechSdkProviderError",
      status: 429,
      provider: "microsoft",
      model: "mai-voice-2.1",
      retryable: true,
    });

    const empty = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array()));
    await expect(
      new MicrosoftSpeechProvider({
        apiKey: "test",
        region: "eastus",
        fetch: empty,
      }).generate({ modelId: "mai-voice-2.1", text: "Hello" })
    ).rejects.toMatchObject({ name: "NoSpeechGeneratedError" });
  });

  it.each([
    ["raw-24khz-16bit-mono-pcm", "audio/pcm;rate=24000"],
    ["raw-22050hz-16bit-mono-pcm", "audio/pcm;rate=22050"],
    ["riff-48khz-16bit-mono-pcm", "audio/wav"],
    ["audio-24khz-160kbitrate-mono-mp3", "audio/mpeg"],
    ["ogg-24khz-16bit-mono-opus", "audio/ogg"],
    ["raw-8khz-8bit-mono-mulaw", "application/octet-stream"],
  ])("labels a custom outputFormat %s as %s", async (outputFormat, mediaType) => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3, 4])));
    const result = await new MicrosoftSpeechProvider({
      apiKey: "test",
      region: "eastus",
      fetch,
    }).generate({
      modelId: "mai-voice-2.1",
      text: "Hello",
      providerOptions: { outputFormat },
    });
    expect(result.mediaType).toBe(mediaType);
  });

  it("treats a WAV with no samples as no speech", async () => {
    const headerOnly = await wrapPcm16Mono(new Uint8Array(), 24_000);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response(headerOnly));
    await expect(
      new MicrosoftSpeechProvider({
        apiKey: "test",
        region: "eastus",
        fetch,
      }).generate({ modelId: "mai-voice-2.1", text: "Hello" })
    ).rejects.toMatchObject({ name: "NoSpeechGeneratedError" });
  });

  it("resolves strings and negotiates native-rate WAV for stitching", () => {
    expect(resolveModel("microsoft").modelId).toBe("mai-voice-2.1-flash");
    expect(resolveModel("microsoft/mai-voice-2.1").provider.id).toBe(
      "microsoft"
    );
    const provider = new MicrosoftSpeechProvider({});
    expect(provider.getStitchOptions("mai-voice-2.1")).toEqual({
      providerOptions: { outputFormat: "riff-24khz-16bit-mono-pcm" },
      mediaType: "audio/wav",
    });
    expect(() =>
      provider.getStitchOptions("mai-voice-2.1", { sampleRate: 32_000 })
    ).toThrow();
    expect(() =>
      provider.getStitchOptions("mai-voice-2.1", { sampleRate: 16_000 })
    ).toThrow();
    expect(provider.getStitchOptions("constructor")).toBeUndefined();
    expect(provider.supportedSampleRates("toString")).toEqual([]);
    expect(provider.getStitchOptions("unknown")).toBeUndefined();
    expect(
      provider.resolveOutputFormat("unknown", { format: "mp3" })
    ).toBeUndefined();
  });
});
