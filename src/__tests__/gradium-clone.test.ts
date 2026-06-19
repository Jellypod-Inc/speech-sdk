import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { GradiumSpeechProvider } from "../providers/gradium/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

describe("GradiumSpeechProvider.cloneVoice", () => {
  it("posts multipart to the voices endpoint with auth and fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ uid: "g1" }),
    });

    const provider = new GradiumSpeechProvider({
      apiKey: "gradium-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
      providerOptions: { description: "warm narrator", language: "en" },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.gradium.ai/api/voices/");
    expect(init.method).toBe("POST");
    expect(init.headers["x-api-key"]).toBe("gradium-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get("name")).toBe("My Voice");
    expect(form.get("description")).toBe("warm narrator");
    expect(form.get("language")).toBe("en");
    expect(form.get("audio_file")).toBeInstanceOf(Blob);

    expect(result.voiceId).toBe("g1");
    expect(result.providerMetadata).toEqual({ uid: "g1" });
  });

  it("throws when response lacks uid", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    });

    const provider = new GradiumSpeechProvider({
      apiKey: "gradium-key",
      fetch: mockFetch,
    });

    await expect(
      provider.cloneVoice({ samples: [sample], name: "x" })
    ).rejects.toThrow();
  });
});
