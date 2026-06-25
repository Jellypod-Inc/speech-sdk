import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { FishAudioSpeechProvider } from "../providers/fish-audio/index.js";

const CANDIDATE_AUDIO = new Uint8Array([10, 20, 30]);

function mockDesignFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        candidates: [{ audio_base64: uint8ArrayToBase64(CANDIDATE_AUDIO) }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ _id: "model_fish" }),
    });
}

describe("FishAudioSpeechProvider.designVoice", () => {
  it("designs a candidate then persists it via the clone endpoint", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new FishAudioSpeechProvider({
      apiKey: "fish-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Studio Narrator",
      description: "warm confident studio narrator",
    });

    const [designUrl, designInit] = mockFetch.mock.calls[0];
    expect(designUrl).toBe("https://api.fish.audio/v1/voice-design");
    expect(designInit.headers.model).toBe("voice-design-1");
    expect(designInit.headers.Authorization).toBe("Bearer fish-key");
    expect(JSON.parse(designInit.body).instruction).toBe(
      "warm confident studio narrator"
    );

    const [cloneUrl, cloneInit] = mockFetch.mock.calls[1];
    expect(cloneUrl).toBe("https://api.fish.audio/model");
    expect(cloneInit.body).toBeInstanceOf(FormData);
    expect((cloneInit.body as FormData).get("title")).toBe("Studio Narrator");

    expect(result.voiceId).toBe("model_fish");
    expect(result.preview?.audio).toEqual(CANDIDATE_AUDIO);
  });

  it("tags the model with voice-design", () => {
    const provider = new FishAudioSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-design");
    }
  });
});
