import { describe, expect, it, vi } from "vitest";
import {
  createGoogle,
  GoogleSpeechProvider,
} from "../providers/google/index.js";

const MODELS = ["gemini-3.8-flash-tts", "gemini-3.8-flash-lite-tts"] as const;
const wav = Uint8Array.from([
  82,
  73,
  70,
  70,
  40,
  0,
  0,
  0,
  87,
  65,
  86,
  69,
  ...new Uint8Array(36),
]);

function mockGenerateContent() {
  return vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/wav",
                    data: Buffer.from(wav).toString("base64"),
                  },
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )
  );
}

describe.each(MODELS)("Google %s", (modelId) => {
  it("sends verbatim text and structured style, and preserves returned WAV", async () => {
    const fetchMock = mockGenerateContent();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });

    const result = await provider.generate({
      modelId,
      text: "Hello!",
      instructions: "Speak softly",
      voice: "Kore",
    });

    expect(fetchMock.mock.calls[0][0]).toContain(
      `/models/${modelId}:generateContent`
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts).toEqual([
      {
        text: "Hello!",
        speech_metadata: { style: "Speak softly" },
      },
    ]);
    expect(
      body.generationConfig.speech_config.voice_config.prebuilt_voice_config
        .voice_name
    ).toBe("Kore");
    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio).toEqual(wav);
  });

  it("labels each dialogue turn in structured metadata", async () => {
    const fetchMock = mockGenerateContent();
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });

    const result = await provider.generateDialogue?.({
      modelId,
      turns: [
        { voice: "Kore", text: "Hi", instructions: "Cheerful" },
        { voice: "Puck", text: "Hello" },
      ],
      instructions: "Conversational",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.contents[0].parts).toEqual([
      {
        text: "Hi",
        speech_metadata: {
          speaker: "Speaker1",
          style: "Conversational\nCheerful",
        },
      },
      {
        text: "Hello",
        speech_metadata: { speaker: "Speaker2", style: "Conversational" },
      },
    ]);
    expect(result?.audio).toEqual(wav);
  });

  it("streams through interactions with transcript and style separated", async () => {
    const sse =
      'event: step.delta\ndata: {"delta":{"type":"audio","data":"AAAAAA=="}}\n\n';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(sse, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    );
    const provider = new GoogleSpeechProvider({
      apiKey: "test-key",
      fetch: fetchMock,
    });

    const result = await provider.stream({
      modelId,
      text: "Hello!",
      instructions: "Speak softly",
      voice: "Kore",
    });

    expect(fetchMock.mock.calls[0][0]).toContain("/interactions");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input).toEqual([
      {
        type: "user_input",
        content: [
          {
            type: "text",
            text: "Hello!",
            annotations: [{ type: "speech_metadata", style: "Speak softly" }],
          },
        ],
      },
    ]);
    expect(body.stream).toBe(true);
    expect(result.mediaType).toBe("audio/pcm;rate=24000");
    expect(
      new Uint8Array(await new Response(result.stream).arrayBuffer())
    ).toEqual(new Uint8Array(4));
  });
});

it("uses Flash-Lite 3.8 as the default Google model", () => {
  expect(createGoogle()().modelId).toBe("gemini-3.8-flash-lite-tts");
});
