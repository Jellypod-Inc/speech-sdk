import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { XaiSpeechProvider } from "../providers/xai/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

describe("XaiSpeechProvider.cloneVoice", () => {
  it("posts multipart form to custom-voices with bearer auth", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ voice_id: "v_1" }),
    });

    const provider = new XaiSpeechProvider({
      apiKey: "xai-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
      language: "es",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/custom-voices");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer xai-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get("name")).toBe("My Voice");
    expect(form.get("language")).toBe("es");
    expect(form.get("file")).toBeInstanceOf(Blob);

    expect(result.voiceId).toBe("v_1");
    expect(result.providerMetadata).toEqual({ voice_id: "v_1" });
    expect(result.warnings).toBeUndefined();
  });

  it("defaults language to en and warns when omitted", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ voice_id: "v_2" }),
    });

    const provider = new XaiSpeechProvider({
      apiKey: "xai-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      samples: [sample],
      name: "Default Lang",
    });

    const form = mockFetch.mock.calls[0][1].body as FormData;
    expect(form.get("language")).toBe("en");
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings?.[0]).toContain("defaulted to 'en'");
  });

  it("appends providerOptions as string fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ voice_id: "v_3" }),
    });

    const provider = new XaiSpeechProvider({
      apiKey: "xai-key",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [sample],
      name: "Opts",
      language: "en",
      providerOptions: { strength: 0.5, config: { a: 1 } },
    });

    const form = mockFetch.mock.calls[0][1].body as FormData;
    expect(form.get("strength")).toBe("0.5");
    expect(form.get("config")).toBe(JSON.stringify({ a: 1 }));
  });
});
