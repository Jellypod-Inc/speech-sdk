import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { InworldSpeechProvider } from "../providers/inworld/index.js";

const PREVIEW_AUDIO = new Uint8Array([3, 1, 4, 1, 5]);

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
        previewVoices: [
          {
            voiceId: "workspace__preview1",
            previewAudio: uint8ArrayToBase64(PREVIEW_AUDIO),
          },
        ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({ voice: { voiceId: "workspace__final" } })
    );
}

describe("InworldSpeechProvider.designVoice", () => {
  it("designs then publishes with Basic auth", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new InworldSpeechProvider({
      apiKey: "inworld-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Support Voice",
      description: "warm friendly support agent",
      language: "en",
    });

    const [designUrl, designInit] = mockFetch.mock.calls[0];
    expect(designUrl).toBe("https://api.inworld.ai/voices/v1/voices:design");
    expect(designInit.headers.Authorization).toBe("Basic inworld-key");
    const designBody = JSON.parse(designInit.body);
    expect(designBody.designPrompt).toBe("warm friendly support agent");
    expect(designBody.langCode).toBe("EN_US");
    expect(designBody.voiceDesignConfig.numberOfSamples).toBe(1);

    const [publishUrl, publishInit] = mockFetch.mock.calls[1];
    expect(publishUrl).toBe(
      "https://api.inworld.ai/voices/v1/voices/workspace__preview1:publish"
    );
    expect(JSON.parse(publishInit.body).displayName).toBe("Support Voice");

    expect(result.voiceId).toBe("workspace__final");
    expect(result.preview?.audio).toEqual(PREVIEW_AUDIO);
  });

  it("warns when defaulting the language", async () => {
    const provider = new InworldSpeechProvider({
      apiKey: "k",
      fetch: mockDesignFetch(),
    });

    const result = await provider.designVoice({
      name: "v",
      description: "warm friendly support agent",
    });

    expect(result.warnings?.length).toBeGreaterThan(0);
  });

  it("tags models with voice-design", () => {
    const provider = new InworldSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-design");
    }
  });
});
