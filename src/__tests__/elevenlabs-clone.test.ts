import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

function mockCloneFetch(
  json: Record<string, unknown> = { voice_id: "vc_123" }
) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => json,
  });
}

describe("ElevenLabsSpeechProvider.cloneVoice", () => {
  it("posts multipart to /v1/voices/add with auth and name", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "el-key-123",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "eleven_multilingual_v2",
      samples: [sample],
      name: "My Voice",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/voices/add");
    expect(init.method).toBe("POST");
    expect(init.headers["xi-api-key"]).toBe("el-key-123");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);

    const body = init.body as FormData;
    expect(body.get("name")).toBe("My Voice");
    expect(body.get("files")).toBeInstanceOf(Blob);
  });

  it("appends one files part per sample", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "el-key-123",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "eleven_multilingual_v2",
      samples: [sample, sample, sample],
      name: "Multi",
    });

    const body = mockFetch.mock.calls[0][1].body as FormData;
    expect(body.getAll("files")).toHaveLength(3);
  });

  it("extracts voiceId from voice_id and returns providerMetadata", async () => {
    const json = { voice_id: "vc_abc", extra: true };
    const mockFetch = mockCloneFetch(json);
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "el-key-123",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      modelId: "eleven_multilingual_v2",
      samples: [sample],
      name: "My Voice",
    });

    expect(result.voiceId).toBe("vc_abc");
    expect(result.providerMetadata).toEqual(json);
  });

  it("allows up to 25 samples", () => {
    const provider = new ElevenLabsSpeechProvider({ apiKey: "el-key-123" });
    expect(provider.maxCloneSamples("eleven_multilingual_v2")).toBe(25);
  });

  it("appends providerOptions as string fields", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "el-key-123",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      modelId: "eleven_multilingual_v2",
      samples: [sample],
      name: "My Voice",
      providerOptions: { remove_background_noise: true, description: "warm" },
    });

    const body = mockFetch.mock.calls[0][1].body as FormData;
    expect(body.get("remove_background_noise")).toBe("true");
    expect(body.get("description")).toBe("warm");
  });
});
