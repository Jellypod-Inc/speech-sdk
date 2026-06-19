import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { MistralSpeechProvider } from "../providers/mistral/index.js";

function mockCloneFetch(id = "voice_1") {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ id }),
  });
}

const SAMPLE = {
  bytes: new Uint8Array([9, 8, 7, 6]),
  mediaType: "audio/wav",
};

describe("MistralSpeechProvider.cloneVoice", () => {
  it("posts JSON to the voices endpoint with Bearer auth", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new MistralSpeechProvider({
      apiKey: "mistral-key",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [SAMPLE],
      name: "My Voice",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.mistral.ai/v1/audio/voices");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers.Authorization).toBe("Bearer mistral-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });

  it("sends name and base64 sample_audio", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new MistralSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [SAMPLE],
      name: "My Voice",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe("My Voice");
    expect(body.sample_audio).toBe(uint8ArrayToBase64(SAMPLE.bytes));
    expect(body.sample_filename).toBe("sample.wav");
  });

  it("merges providerOptions untransformed", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new MistralSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [SAMPLE],
      name: "v",
      providerOptions: { description: "narrator" },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.description).toBe("narrator");
  });

  it("does not let providerOptions overwrite required payload fields", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new MistralSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [SAMPLE],
      name: "Real Name",
      providerOptions: { name: "hijacked", sample_audio: "hijacked" },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.name).toBe("Real Name");
    expect(body.sample_audio).toBe(uint8ArrayToBase64(SAMPLE.bytes));
  });

  it("extracts voiceId from id", async () => {
    const provider = new MistralSpeechProvider({
      apiKey: "k",
      fetch: mockCloneFetch("voice_abc"),
    });

    const result = await provider.cloneVoice({
      samples: [SAMPLE],
      name: "v",
    });

    expect(result.voiceId).toBe("voice_abc");
    expect(result.providerMetadata).toEqual({ id: "voice_abc" });
  });

  it("tags the model with voice-cloning", () => {
    const provider = new MistralSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-cloning");
    }
  });
});
