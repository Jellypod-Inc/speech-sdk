import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

const PREVIEW_AUDIO = new Uint8Array([1, 2, 3, 4]);

function jsonResponse(body: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  };
}

function mockDesignFetch() {
  return vi
    .fn()
    .mockResolvedValueOnce(
      jsonResponse({
        previews: [
          {
            generated_voice_id: "gen_1",
            audio_base_64: uint8ArrayToBase64(PREVIEW_AUDIO),
            media_type: "audio/mpeg",
          },
        ],
      })
    )
    .mockResolvedValueOnce(jsonResponse({ voice_id: "voice_final" }));
}

describe("ElevenLabsSpeechProvider.designVoice", () => {
  it("posts the description to /v1/text-to-voice/design then persists via /v1/text-to-voice", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "el-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Narrator",
      description: "a warm british narrator",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [designUrl, designInit] = mockFetch.mock.calls[0];
    expect(designUrl).toBe("https://api.elevenlabs.io/v1/text-to-voice/design");
    expect(designInit.headers["xi-api-key"]).toBe("el-key");
    expect(designInit.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    const designBody = JSON.parse(designInit.body);
    expect(designBody.voice_description).toBe("a warm british narrator");
    expect(designBody.auto_generate_text).toBe(true);

    const [createUrl, createInit] = mockFetch.mock.calls[1];
    expect(createUrl).toBe("https://api.elevenlabs.io/v1/text-to-voice");
    const createBody = JSON.parse(createInit.body);
    expect(createBody.voice_name).toBe("Narrator");
    expect(createBody.generated_voice_id).toBe("gen_1");

    expect(result.voiceId).toBe("voice_final");
    expect(result.preview?.audio).toEqual(PREVIEW_AUDIO);
    expect(result.preview?.mediaType).toBe("audio/mpeg");
  });

  it("sends previewText as text when provided", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new ElevenLabsSpeechProvider({
      apiKey: "el-key",
      fetch: mockFetch,
    });

    await provider.designVoice({
      name: "Narrator",
      description: "a warm british narrator",
      previewText: "Once upon a time in a land far away.",
    });

    const designBody = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(designBody.text).toBe("Once upon a time in a land far away.");
    expect(designBody.auto_generate_text).toBeUndefined();
  });

  it("tags models with voice-design", () => {
    const provider = new ElevenLabsSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-design");
    }
  });
});
