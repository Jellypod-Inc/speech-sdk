import { describe, expect, it, vi } from "vitest";
import { generateConversation } from "../generate-conversation.js";
import { createSpeechGateway } from "../providers/gateway/index.js";

describe("generateConversation with pronunciations (native dialogue path)", () => {
  it("substitutes each turn's text before native dispatch and inverse-aligns combined timestamps", async () => {
    const generateDialogue = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
      timestamps: [
        { text: "el", start: 0.0, end: 0.1, turnIndex: 0 },
        { text: "el", start: 0.1, end: 0.2, turnIndex: 0 },
        { text: "em", start: 0.2, end: 0.3, turnIndex: 0 },
        { text: "Hi", start: 0.4, end: 0.5, turnIndex: 1 },
      ],
    });
    const provider = {
      id: "fake",
      defaultModel: "d1",
      models: [{ id: "d1", features: ["timestamps"] }],
      generate: vi.fn(),
      generateDialogue,
      dialogueCapabilities: () => ({ maxVoices: 4 }),
    };
    const model = { provider, modelId: "d1" } as never;

    const result = await generateConversation({
      model,
      timestamps: true,
      turns: [
        { text: "LLM", voice: "v1" },
        { text: "Hi", voice: "v2" },
      ],
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });

    // Provider was called with substituted turn texts
    const dialogueArgs = generateDialogue.mock.calls[0][0];
    expect(dialogueArgs.turns.map((t: { text: string }) => t.text)).toEqual([
      "el el em",
      "Hi",
    ]);

    // Caller-visible timestamps reflect the original word
    expect(result.timestamps?.map((t) => t.text)).toEqual(["LLM", "Hi"]);
    expect(result.timestamps?.map((t) => t.turnIndex)).toEqual([0, 1]);
  });

  it("handles a turn with no pronunciation matches alongside one with matches", async () => {
    const generateDialogue = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
      timestamps: [
        { text: "Plain", start: 0.0, end: 0.2, turnIndex: 0 },
        { text: "el", start: 0.3, end: 0.4, turnIndex: 1 },
        { text: "el", start: 0.4, end: 0.5, turnIndex: 1 },
        { text: "em", start: 0.5, end: 0.6, turnIndex: 1 },
      ],
    });
    const provider = {
      id: "fake",
      defaultModel: "d1",
      models: [{ id: "d1", features: ["timestamps"] }],
      generate: vi.fn(),
      generateDialogue,
      dialogueCapabilities: () => ({ maxVoices: 4 }),
    };
    const model = { provider, modelId: "d1" } as never;

    const result = await generateConversation({
      model,
      timestamps: true,
      turns: [
        { text: "Plain", voice: "v1" },
        { text: "LLM", voice: "v2" },
      ],
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });

    expect(result.timestamps?.map((t) => t.text)).toEqual(["Plain", "LLM"]);
  });

  it("is a no-op on the native path when pronunciations is undefined", async () => {
    const generateDialogue = vi.fn().mockResolvedValue({
      audio: new Uint8Array([1]),
      mediaType: "audio/wav",
      timestamps: [],
    });
    const provider = {
      id: "fake",
      defaultModel: "d1",
      models: [{ id: "d1", features: [] }],
      generate: vi.fn(),
      generateDialogue,
      dialogueCapabilities: () => ({ maxVoices: 4 }),
    };
    const model = { provider, modelId: "d1" } as never;

    await generateConversation({
      model,
      turns: [
        { text: "Plain", voice: "v1" },
        { text: "Just text", voice: "v2" },
      ],
    });

    const dialogueArgs = generateDialogue.mock.calls[0][0];
    expect(dialogueArgs.turns.map((t: { text: string }) => t.text)).toEqual([
      "Plain",
      "Just text",
    ]);
  });
});

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
      pronunciations: { rules: [{ word: "T1", replacement: "tee one" }] },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.pronunciations).toEqual({
      rules: [{ word: "T1", replacement: "tee one" }],
    });
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
