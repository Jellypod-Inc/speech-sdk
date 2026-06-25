import { describe, expect, it, vi } from "vitest";
import { MiniMaxSpeechProvider } from "../providers/minimax/index.js";

function mockDesignFetch(body: Record<string, unknown> = { voice_id: "vd_1" }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  });
}

describe("MiniMaxSpeechProvider.designVoice", () => {
  it("posts prompt and preview_text to /voice_design with Bearer auth", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new MiniMaxSpeechProvider({
      apiKey: "mm-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "narrator one",
      description: "energetic sports announcer",
      previewText: "And the crowd goes wild!",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.minimax.io/v1/voice_design");
    expect(init.headers.Authorization).toBe("Bearer mm-key");
    const body = JSON.parse(init.body);
    expect(body.prompt).toBe("energetic sports announcer");
    expect(body.preview_text).toBe("And the crowd goes wild!");
    expect(result.voiceId).toBe("vd_1");
  });

  it("defaults preview_text when not provided", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new MiniMaxSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.designVoice({
      name: "x",
      description: "calm voice",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(typeof body.preview_text).toBe("string");
    expect(body.preview_text.length).toBeGreaterThan(0);
  });

  it("passes a valid name as voice_id and decodes hex trial_audio", async () => {
    const mockFetch = mockDesignFetch({
      voice_id: "MyVoice_01",
      trial_audio: "00ff10",
    });
    const provider = new MiniMaxSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "MyVoice_01",
      description: "calm voice",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_id).toBe("MyVoice_01");
    expect(result.preview?.audio).toEqual(new Uint8Array([0x00, 0xff, 0x10]));
  });

  it("omits voice_id when name does not satisfy MiniMax id rules", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new MiniMaxSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    await provider.designVoice({
      name: "has spaces",
      description: "calm voice",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.voice_id).toBeUndefined();
  });

  it("omits preview (does not throw) when trial_audio is malformed", async () => {
    const mockFetch = mockDesignFetch({
      voice_id: "vd_ok",
      trial_audio: "zznothex",
    });
    const provider = new MiniMaxSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "x",
      description: "calm voice",
    });

    expect(result.voiceId).toBe("vd_ok");
    expect(result.preview).toBeUndefined();
  });

  it("tags models with voice-design", () => {
    const provider = new MiniMaxSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-design");
    }
  });
});
