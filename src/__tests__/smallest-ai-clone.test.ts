import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { SmallestAISpeechProvider } from "../providers/smallest-ai/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

describe("SmallestAISpeechProvider.cloneVoice", () => {
  it("posts multipart to the waves-api clone endpoint with auth and fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ voiceId: "s1", model: "lightning", status: "ok" }),
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "smallest-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      modelId: "lightning_v3.1",
      samples: [sample],
      name: "My Voice",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://waves-api.smallest.ai/api/v1/lightning-large/add_voice"
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer smallest-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get("displayName")).toBe("My Voice");
    expect(form.get("file")).toBeInstanceOf(Blob);

    expect(result.voiceId).toBe("s1");
    expect(result.providerMetadata).toEqual({
      voiceId: "s1",
      model: "lightning",
      status: "ok",
    });
  });

  it("extracts voiceId from a nested data object", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: { voiceId: "nested-1" } }),
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "smallest-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      modelId: "lightning_v3.1",
      samples: [sample],
      name: "My Voice",
    });

    expect(result.voiceId).toBe("nested-1");
  });

  it("throws when response lacks voiceId", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({}),
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "smallest-key",
      fetch: mockFetch,
    });

    await expect(
      provider.cloneVoice({
        modelId: "lightning_v3.1",
        samples: [sample],
        name: "x",
      })
    ).rejects.toThrow();
  });
});
