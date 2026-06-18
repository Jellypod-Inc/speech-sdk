import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

describe("FishAudioSpeechProvider.cloneVoice", () => {
  it("posts multipart form to the model endpoint with auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ _id: "m_1" }),
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: "fish-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      modelId: "s2-pro",
      samples: [sample],
      name: "My Voice",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.fish.audio/model");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer fish-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.body).toBeInstanceOf(FormData);
    expect(result.voiceId).toBe("m_1");
    expect(result.providerMetadata).toEqual({ _id: "m_1" });
  });

  it("includes title, type=tts, train_mode=fast and a voices file part", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ _id: "m_2" }),
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: "fish-key",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "s2-pro",
      samples: [{ ...sample, transcript: "hello there" }],
      name: "Narrator",
    });

    const form = mockFetch.mock.calls[0][1].body as FormData;
    expect(form.get("title")).toBe("Narrator");
    expect(form.get("type")).toBe("tts");
    expect(form.get("train_mode")).toBe("fast");
    expect(form.get("visibility")).toBe("private");
    expect(form.get("texts")).toBe("hello there");
    expect(form.get("voices")).toBeInstanceOf(Blob);
  });

  it("allows up to 10 clone samples", () => {
    const provider = new FishAudioSpeechProvider({ apiKey: "fish-key" });
    expect(provider.maxCloneSamples()).toBe(10);
  });

  it("appends providerOptions as string fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ _id: "m_3" }),
    });

    const provider = new FishAudioSpeechProvider({
      apiKey: "fish-key",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "s2-pro",
      samples: [sample],
      name: "Opts",
      providerOptions: { enhance_audio: true, tags: ["a", "b"] },
    });

    const form = mockFetch.mock.calls[0][1].body as FormData;
    expect(form.get("enhance_audio")).toBe("true");
    expect(form.get("tags")).toBe(JSON.stringify(["a", "b"]));
  });
});
