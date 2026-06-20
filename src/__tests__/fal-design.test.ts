import { describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { FalSpeechProvider } from "../providers/fal/index.js";

const PREVIEW_AUDIO = new Uint8Array([5, 6, 7]);

function mockDesignFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        custom_voice_id: "voice_fal",
        audio: {
          url: "https://cdn.fal/preview.mp3",
          content_type: "audio/mpeg",
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => PREVIEW_AUDIO.buffer,
    });
}

describe("FalSpeechProvider.designVoice", () => {
  it("posts to the minimax voice-design model with Key auth and fetches the preview", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new FalSpeechProvider({
      apiKey: "fal-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Narrator",
      description: "deep movie trailer voice",
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://fal.run/fal-ai/minimax/voice-design");
    expect(init.headers.Authorization).toBe("Key fal-key");
    expect(init.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    const body = JSON.parse(init.body);
    expect(body.prompt).toBe("deep movie trailer voice");
    expect(typeof body.preview_text).toBe("string");

    expect(mockFetch.mock.calls[1][0]).toBe("https://cdn.fal/preview.mp3");
    expect(result.voiceId).toBe("voice_fal");
    expect(result.preview?.audio).toEqual(PREVIEW_AUDIO);
    expect(result.preview?.mediaType).toBe("audio/mpeg");
  });
});
