import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { SmallestAISpeechProvider } from "../providers/smallest-ai/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

describe("SmallestAISpeechProvider.cloneVoice", () => {
  it("posts multipart to the voice-cloning endpoint with auth and fields", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        data: { voiceId: "s1", model: "lightning-v3.1", status: "completed" },
      }),
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "smallest-key",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://waves-api.smallest.ai/api/v1/voice-cloning");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer smallest-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.body).toBeInstanceOf(FormData);

    const form = init.body as FormData;
    expect(form.get("displayName")).toBe("My Voice");
    expect(form.get("file")).toBeInstanceOf(Blob);

    expect(result.voiceId).toBe("s1");
    expect(result.providerMetadata).toEqual({
      data: { voiceId: "s1", model: "lightning-v3.1", status: "completed" },
    });
  });

  it("routes clone through a custom baseURL when configured", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: { voiceId: "s1" } }),
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "smallest-key",
      baseURL: "https://proxy.internal/smallest",
      fetch: mockFetch,
    });

    await provider.cloneVoice({ samples: [sample], name: "My Voice" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://proxy.internal/smallest/voice-cloning");
  });

  it("derives the clone endpoint from a default-host baseURL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ data: { voiceId: "s1" } }),
    });

    const provider = new SmallestAISpeechProvider({
      apiKey: "smallest-key",
      baseURL: "https://api.smallest.ai/waves/v1",
      fetch: mockFetch,
    });

    await provider.cloneVoice({ samples: [sample], name: "My Voice" });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.smallest.ai/waves/v1/voice-cloning");
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
        samples: [sample],
        name: "x",
      })
    ).rejects.toThrow();
  });
});
