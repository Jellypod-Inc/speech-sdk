import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

function mockCloneFetch(voiceId = "vc_1") {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ voice: { voiceId } }),
  });
}

const SAMPLE = {
  bytes: new Uint8Array([1, 2, 3, 4]),
  mediaType: "audio/wav",
};

describe("InworldSpeechProvider.cloneVoice", () => {
  it("posts JSON to the clone endpoint with Basic auth", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "encoded-basic-key",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "My Voice",
      language: "en",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.inworld.ai/voices/v1/voices:clone");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Basic encoded-basic-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("sends the body shape with base64 sample", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "My Voice",
      language: "en",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.displayName).toBe("My Voice");
    expect(body.langCode).toBe("EN_US");
    expect(body.voiceSamples).toHaveLength(1);
    expect(body.voiceSamples[0].audioData).toBe(
      uint8ArrayToBase64(SAMPLE.bytes)
    );
  });

  it("maps language 'es' to ES_ES", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "v",
      language: "es",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.langCode).toBe("ES_ES");
  });

  it("maps an unmapped language to AUTO", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "v",
      language: "fi",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.langCode).toBe("AUTO");
  });

  it("defaults to EN_US and warns when language is omitted", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "v",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.langCode).toBe("EN_US");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("inworld requires a language");
  });

  it("lets providerOptions.langCode override the mapping", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "v",
      language: "es",
      providerOptions: { langCode: "PT_BR" },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.langCode).toBe("PT_BR");
  });

  it("extracts voiceId from voice.voiceId", async () => {
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockCloneFetch("vc_abc"),
    });

    const result = await provider.cloneVoice({
      modelId: "inworld-tts-1.5-max",
      samples: [SAMPLE],
      name: "v",
      language: "en",
    });

    expect(result.voiceId).toBe("vc_abc");
    expect(result.providerMetadata).toEqual({ voice: { voiceId: "vc_abc" } });
  });

  it("accepts up to 10 clone samples", () => {
    const provider = new InworldSpeechProvider({ apiKey: "k" });
    expect(provider.maxCloneSamples("inworld-tts-1.5-max")).toBe(10);
  });

  it("tags clone-capable models with voice-cloning", () => {
    const provider = new InworldSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-cloning");
    }
  });
});
