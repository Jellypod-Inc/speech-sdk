import { describe, expect, it, vi } from "vitest";
import { ResembleSpeechProvider } from "../providers/resemble/index.js";

const PREVIEW_AUDIO = new Uint8Array([7, 7, 7]);

function mockDesignFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        voice_candidates: { voice_design_model_uuid: "uuid-1" },
        samples: [{ sample_index: 0, audio_url: "https://cdn.resemble/p.wav" }],
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ voice_uuid: "voice_resemble" }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/wav" }),
      arrayBuffer: async () => PREVIEW_AUDIO.buffer,
    });
}

describe("ResembleSpeechProvider.designVoice", () => {
  it("generates candidates then creates a reusable voice with Bearer auth", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new ResembleSpeechProvider({
      apiKey: "rsmbl-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Tour Guide",
      description: "an upbeat australian guide",
    });

    const [designUrl, designInit] = mockFetch.mock.calls[0];
    expect(designUrl).toBe("https://app.resemble.ai/api/v2/voice-design");
    expect(designInit.headers.Authorization).toBe("Bearer rsmbl-key");
    expect(JSON.parse(designInit.body).user_prompt).toBe(
      "an upbeat australian guide"
    );

    const [createUrl, createInit] = mockFetch.mock.calls[1];
    expect(createUrl).toBe(
      "https://app.resemble.ai/api/v2/voice-design/uuid-1/0/create_rapid_voice"
    );
    expect(createInit.body).toBeInstanceOf(FormData);
    expect((createInit.body as FormData).get("voice_name")).toBe("Tour Guide");

    expect(result.voiceId).toBe("voice_resemble");
    expect(result.preview?.audio).toEqual(PREVIEW_AUDIO);
  });

  it("supports the array candidate response shape (uuid / voice_sample_index)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          voice_candidates: [
            {
              uuid: "uuid-arr",
              voice_sample_index: 2,
              audio_url: "https://cdn.resemble/p.wav",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ voice_uuid: "voice_arr" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "audio/wav" }),
        arrayBuffer: async () => PREVIEW_AUDIO.buffer,
      });
    const provider = new ResembleSpeechProvider({
      apiKey: "k",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Guide",
      description: "an upbeat australian guide",
    });

    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://app.resemble.ai/api/v2/voice-design/uuid-arr/2/create_rapid_voice"
    );
    expect(mockFetch.mock.calls[2][0]).toBe("https://cdn.resemble/p.wav");
    expect(result.preview?.audio).toEqual(PREVIEW_AUDIO);
    expect(result.voiceId).toBe("voice_arr");
  });

  it("tags the model with voice-design", () => {
    const provider = new ResembleSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-design");
    }
  });
});
