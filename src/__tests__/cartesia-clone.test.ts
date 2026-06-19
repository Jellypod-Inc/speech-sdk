import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

function mockCloneFetch(json: Record<string, unknown> = { id: "voice_123" }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => json,
  });
}

describe("CartesiaSpeechProvider.cloneVoice", () => {
  it("posts multipart to /voices/clone with auth and headers", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new CartesiaSpeechProvider({
      apiKey: "cartesia-key-123",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
      language: "en",
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.cartesia.ai/voices/clone");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-Key"]).toBe("cartesia-key-123");
    expect(init.headers["Cartesia-Version"]).toBe("2026-03-01");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);

    const body = init.body as FormData;
    expect(body.get("name")).toBe("My Voice");
    expect(body.get("language")).toBe("en");
    expect(body.get("clip")).toBeInstanceOf(Blob);
  });

  it("extracts voiceId from id and returns providerMetadata", async () => {
    const json = { id: "voice_abc", extra: true };
    const mockFetch = mockCloneFetch(json);
    const provider = new CartesiaSpeechProvider({
      apiKey: "cartesia-key-123",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
      language: "en",
    });

    expect(result.voiceId).toBe("voice_abc");
    expect(result.providerMetadata).toEqual(json);
  });

  it("defaults language to en and warns when omitted", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new CartesiaSpeechProvider({
      apiKey: "cartesia-key-123",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
    });

    const body = mockFetch.mock.calls[0][1].body as FormData;
    expect(body.get("language")).toBe("en");
    expect(result.warnings).toBeDefined();
    expect(result.warnings?.[0]).toContain("cartesia requires a language");
    expect(result.warnings?.[0]).toContain("defaulted to 'en'");
  });

  it("appends providerOptions as string fields", async () => {
    const mockFetch = mockCloneFetch();
    const provider = new CartesiaSpeechProvider({
      apiKey: "cartesia-key-123",
      fetch: mockFetch,
    });

    await provider.cloneVoice({
      samples: [sample],
      name: "My Voice",
      language: "en",
      providerOptions: { enhance: true },
    });

    const body = mockFetch.mock.calls[0][1].body as FormData;
    expect(body.get("enhance")).toBe("true");
  });
});
