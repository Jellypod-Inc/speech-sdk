import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { XaiSpeechProvider } from "../providers/xai/index.js";

describe("XaiSpeechProvider", () => {
  it("sends Bearer auth and X-User-Agent headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });

    const provider = new XaiSpeechProvider({
      apiKey: "xai-test-key",
      fetch: mockFetch as unknown as typeof globalThis.fetch,
    });

    await provider.generate({
      modelId: "grok-tts",
      text: "Hi",
      voice: "alloy",
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.Authorization).toBe("Bearer xai-test-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
  });
});
