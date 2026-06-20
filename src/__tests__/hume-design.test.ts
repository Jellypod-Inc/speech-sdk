import { describe, expect, it, vi } from "vitest";
import { uint8ArrayToBase64 } from "../audio-utils.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";

const PREVIEW_AUDIO = new Uint8Array([2, 4, 6, 8]);

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
        generations: [
          {
            generation_id: "gen_99",
            audio: uint8ArrayToBase64(PREVIEW_AUDIO),
            encoding: { format: "mp3" },
          },
        ],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({ name: "Narrator", id: "abc", provider: "CUSTOM_VOICE" })
    );
}

describe("HumeSpeechProvider.designVoice", () => {
  it("designs via /tts then saves via /tts/voices", async () => {
    const mockFetch = mockDesignFetch();
    const provider = new HumeSpeechProvider({
      apiKey: "hume-key",
      fetch: mockFetch,
    });

    const result = await provider.designVoice({
      name: "Narrator",
      description: "a calm meditative guide",
    });

    const [designUrl, designInit] = mockFetch.mock.calls[0];
    expect(designUrl).toBe("https://api.hume.ai/v0/tts");
    expect(designInit.headers["X-Hume-Api-Key"]).toBe("hume-key");
    const designBody = JSON.parse(designInit.body);
    expect(designBody.utterances[0].description).toBe(
      "a calm meditative guide"
    );

    const [saveUrl, saveInit] = mockFetch.mock.calls[1];
    expect(saveUrl).toBe("https://api.hume.ai/v0/tts/voices");
    const saveBody = JSON.parse(saveInit.body);
    expect(saveBody.generation_id).toBe("gen_99");
    expect(saveBody.name).toBe("Narrator");

    // Hume references custom voices by name.
    expect(result.voiceId).toBe("Narrator");
    expect(result.preview?.audio).toEqual(PREVIEW_AUDIO);
    expect(result.warnings?.[0]).toContain("CUSTOM_VOICE");
  });

  it("references a designed voice under CUSTOM_VOICE when generating", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/mpeg" }),
      arrayBuffer: async () => new Uint8Array([1]).buffer,
    });
    const provider = new HumeSpeechProvider({ apiKey: "k", fetch: mockFetch });

    await provider.generate({
      modelId: "octave-2",
      text: "hello",
      voice: "Narrator",
      providerOptions: { voiceProvider: "CUSTOM_VOICE" },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.utterances[0].voice).toEqual({
      name: "Narrator",
      provider: "CUSTOM_VOICE",
    });
    // voiceProvider is consumed, not forwarded as a stray body field.
    expect(body.voiceProvider).toBeUndefined();
  });

  it("tags models with voice-design", () => {
    const provider = new HumeSpeechProvider({ apiKey: "k" });
    for (const model of provider.models) {
      expect(model.features).toContain("voice-design");
    }
  });
});
