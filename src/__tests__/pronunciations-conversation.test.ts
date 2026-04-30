import { describe, expect, it, vi } from "vitest";
import { generateConversation } from "../generate-conversation.js";
import { createSpeechGateway } from "../providers/gateway/index.js";

// Top-level regex per lint rules.
const DICT_IDS_RE = /dictionaryIds/i;

describe("generateConversation with pronunciations (stitch path)", () => {
  it("applies pronunciation rules to each turn's text before calling provider.generate", async () => {
    // PCM Int16 2400-sample payload (0.1 s at 24kHz) — decodeToPcm16 handles raw PCM.
    const pcm = new Int16Array(2400);
    pcm.fill(100);
    const pcmBytes = new Uint8Array(pcm.buffer);

    const generateMock = vi.fn().mockResolvedValue({
      audio: pcmBytes,
      mediaType: "audio/pcm;rate=24000",
    });
    const fakeProvider = {
      id: "fake",
      defaultModel: "f1",
      models: [{ id: "f1", features: [], languages: [], releaseDate: "" }],
      generate: generateMock,
      getStitchOptions: () => ({
        providerOptions: {},
        mediaType: "audio/pcm;rate=24000",
      }),
    };
    const fakeModel = { provider: fakeProvider, modelId: "f1" } as never;

    await generateConversation({
      model: fakeModel,
      turns: [
        { text: "Turn 1 with LLM.", voice: "v1" },
        { text: "Turn 2 with LLM.", voice: "v2" },
      ],
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });

    // generateSpeech applies substitution before calling provider.generate — verify substituted text reached the provider.
    expect(generateMock).toHaveBeenCalledTimes(2);
    expect(generateMock.mock.calls[0][0].text).toBe("Turn 1 with el el em.");
    expect(generateMock.mock.calls[1][0].text).toBe("Turn 2 with el el em.");
  });
});

describe("generateConversation with pronunciations (gateway path)", () => {
  it("passes pronunciations into the gateway conversation body", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audio: Buffer.from(new Uint8Array([1])).toString("base64"),
          mediaType: "audio/wav",
          timestamps: [],
          warnings: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const gw = createSpeechGateway({ apiKey: "test", fetch: fetchSpy });
    await generateConversation({
      model: gw("openai/tts-1"),
      turns: [
        { text: "T1", voice: "alloy" },
        { text: "T2", voice: "echo" },
      ],
      pronunciations: { dictionaryIds: ["d1"] },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.pronunciations).toEqual({ dictionaryIds: ["d1"] });
  });

  it("throws DictionaryIdsRequireGatewayError on stitch path with dictionary ids", async () => {
    const fakeProvider = {
      id: "fake",
      defaultModel: "f1",
      models: [{ id: "f1", features: [], languages: [], releaseDate: "" }],
      generate: vi.fn(),
      getStitchOptions: () => ({
        providerOptions: {},
        mediaType: "audio/pcm;rate=24000",
      }),
    };
    const fakeModel = { provider: fakeProvider, modelId: "f1" } as never;

    await expect(() =>
      generateConversation({
        model: fakeModel,
        turns: [
          { text: "T1", voice: "v1" },
          { text: "T2", voice: "v2" },
        ],
        pronunciations: { dictionaryIds: ["d1"] },
      })
    ).rejects.toThrow(DICT_IDS_RE);
  });

  it("is a no-op when pronunciations is undefined (gateway path)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          audio: Buffer.from(new Uint8Array([1])).toString("base64"),
          mediaType: "audio/wav",
          timestamps: [],
          warnings: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const gw = createSpeechGateway({ apiKey: "test", fetch: fetchSpy });
    await generateConversation({
      model: gw("openai/tts-1"),
      turns: [
        { text: "T1", voice: "alloy" },
        { text: "T2", voice: "echo" },
      ],
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect("pronunciations" in body).toBe(false);
  });
});
