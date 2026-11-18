import { describe, expect, it, vi } from "vitest";
import { NoSpeechGeneratedError, SpeechSDKError } from "../errors.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";

async function collect(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

describe("GoogleSpeechProvider.stream", () => {
  // 2.5 TTS has no progressive streaming endpoint, so stream() delegates to
  // generate() and wraps the buffered WAV in a single-chunk ReadableStream.
  // 3.1+ streams for real via /interactions (covered separately below).

  it("delegates to generateContent and returns a single-chunk WAV stream", async () => {
    // 4 bytes of 16-bit PCM (2 samples of silence)
    const pcmBase64 = "AAAAAA==";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=24000",
                    data: pcmBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "hi",
      voice: "Kore",
    });

    // Should hit the non-streaming generateContent endpoint, not
    // streamGenerateContent.
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain(":generateContent");
    expect(url).not.toContain(":streamGenerateContent");

    if (!result) {
      throw new Error("no result");
    }
    expect(result.mediaType).toBe("audio/wav");

    const decoded = await collect(result.stream);
    // 44-byte WAV header + 4 bytes of PCM
    expect(decoded.length).toBe(48);

    const riff = new TextDecoder().decode(decoded.slice(0, 4));
    expect(riff).toBe("RIFF");
    const wave = new TextDecoder().decode(decoded.slice(8, 12));
    expect(wave).toBe("WAVE");

    // WAV header sample rate field (offset 24, little-endian uint32)
    const view = new DataView(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength
    );
    expect(view.getUint32(24, true)).toBe(24_000);
  });

  it("streams gemini-3.1 via the /interactions endpoint as raw PCM chunks", async () => {
    // Two base64 PCM deltas: "QUI=" -> "AB", "Q0Q=" -> "CD"
    const sse = [
      'event: step.start\ndata: {"index":0,"step":{"type":"model_output"},"event_type":"step.start"}\n\n',
      'event: step.delta\ndata: {"index":0,"delta":{"mime_type":"audio/l16","data":"QUI="},"event_type":"step.delta"}\n\n',
      'event: step.delta\ndata: {"index":0,"delta":{"mime_type":"audio/l16","data":"Q0Q="},"event_type":"step.delta"}\n\n',
      'event: step.stop\ndata: {"index":0,"event_type":"step.stop"}\n\n',
      'event: interaction.completed\ndata: {"interaction":{"status":"completed"},"event_type":"interaction.completed"}\n\n',
      "event: done\ndata: [DONE]\n\n",
    ].join("");
    const encoder = new TextEncoder();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(sse));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "text/event-stream" } }
      )
    );

    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "gemini-3.1-flash-tts-preview",
      text: "hi",
      voice: "Kore",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/interactions");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.stream).toBe(true);
    expect(body.model).toBe("gemini-3.1-flash-tts-preview");
    expect(body.input).toContain("\nTranscript:\nhi");
    expect(body.generation_config.speech_config).toEqual([{ voice: "Kore" }]);
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "gg-test"
    );

    if (!result) {
      throw new Error("no result");
    }
    expect(result.mediaType).toBe("audio/pcm;rate=24000");

    const decoded = await collect(result.stream);
    // Raw PCM passthrough, no WAV header.
    expect(new TextDecoder().decode(decoded)).toBe("ABCD");
  });

  it("honors non-default sample rate from the response mimeType", async () => {
    // generate() parses the rate= parameter from inlineData.mimeType.
    // Since stream() delegates to generate(), it inherits this behavior.
    const pcmBase64 = "AAAAAA==";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    mimeType: "audio/L16;codec=pcm;rate=48000",
                    data: pcmBase64,
                  },
                },
              ],
            },
          },
        ],
      }),
    });

    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "gemini-2.5-flash-preview-tts",
      text: "hi",
      voice: "Kore",
    });

    if (!result) {
      throw new Error("no result");
    }
    const decoded = await collect(result.stream);
    const view = new DataView(
      decoded.buffer,
      decoded.byteOffset,
      decoded.byteLength
    );
    expect(view.getUint32(24, true)).toBe(48_000);
  });
});

const AUDIO_DELTA =
  'event: step.delta\ndata: {"index":0,"delta":{"mime_type":"audio/l16","data":"QUI=","channels":1,"sample_rate":24000,"type":"audio"},"event_type":"step.delta"}\n\n';
const CREATED =
  'event: interaction.created\ndata: {"interaction":{"id":"v1_abc","object":"interaction"},"event_type":"interaction.created"}\n\n';

function completedEvent(status: string): string {
  return `event: interaction.completed\ndata: {"interaction":{"id":"v1_abc","status":"${status}"},"event_type":"interaction.completed"}\n\n`;
}

const ENTRY_POINTS = [
  {
    name: "stream (gemini-3.1-flash-tts-preview)",
    open: (provider: GoogleSpeechProvider) =>
      provider.stream({
        modelId: "gemini-3.1-flash-tts-preview",
        text: "hi",
        voice: "Kore",
      }),
  },
  {
    name: "streamDialogue (gemini-3.8-flash-tts)",
    open: (provider: GoogleSpeechProvider) =>
      provider.streamDialogue({
        modelId: "gemini-3.8-flash-tts",
        turns: [
          { voice: "Kore", text: "Hi." },
          { voice: "Puck", text: "Hello." },
        ],
      }),
  },
];

describe.each(
  ENTRY_POINTS
)("GoogleSpeechProvider.$name interaction lifecycle", ({ open }) => {
  async function streamOf(sse: string) {
    const provider = new GoogleSpeechProvider({
      apiKey: "gg-test",
      fetch: vi.fn().mockResolvedValue(new Response(sse)),
    });
    return (await open(provider)).stream;
  }

  async function failureOf(sse: string): Promise<unknown> {
    return await collect(await streamOf(sse)).catch((err: unknown) => err);
  }

  it("delivers the audio received before an error event, then errors", async () => {
    const reader = (
      await streamOf(
        `${CREATED + AUDIO_DELTA}event: error\ndata: {"error":{"message":"Deadline expired before operation could complete.","code":"gateway_timeout"},"event_type":"error"}\n\n`
      )
    ).getReader();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(new TextDecoder().decode((await reader.read()).value)).toBe("AB");
    await expect(reader.read()).rejects.toThrow(
      "Deadline expired before operation could complete. (code: gateway_timeout) (request: v1_abc)"
    );
  });

  it("errors on a failed status_update", async () => {
    const error = await failureOf(
      `${AUDIO_DELTA}event: interaction.status_update\ndata: {"interaction_id":"v1_abc","status":"failed","event_type":"interaction.status_update"}\n\n`
    );
    expect(error).toBeInstanceOf(SpeechSDKError);
    expect((error as Error).message).toContain("interaction failed");
  });

  it("errors when the interaction completes as incomplete", async () => {
    const error = await failureOf(
      `${AUDIO_DELTA}event: interaction.completed\ndata: {"interaction":{"id":"v1_abc","status":"incomplete","error":{"message":"Output limit reached"}},"event_type":"interaction.completed"}\n\n`
    );
    expect((error as Error).message).toContain(
      "interaction incomplete: Output limit reached"
    );
  });

  it("errors when the interaction completes with a non-terminal status", async () => {
    const error = await failureOf(
      AUDIO_DELTA + completedEvent("requires_action")
    );
    expect((error as Error).message).toContain(
      "ended with status requires_action"
    );
  });

  it("errors when the body ends before interaction.completed", async () => {
    const error = await failureOf(
      `${AUDIO_DELTA}event: done\ndata: [DONE]\n\n`
    );
    expect((error as Error).message).toContain(
      "ended before interaction.completed"
    );
  });

  it("throws NoSpeechGeneratedError when the interaction completes without audio", async () => {
    const error = await failureOf(completedEvent("completed"));
    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error).toMatchObject({
      reason: "provider_empty_response",
      requestId: "v1_abc",
    });
  });

  it("classifies a refusal before any audio as content_refusal", async () => {
    const error = await failureOf(
      `${CREATED}event: interaction.completed\ndata: {"interaction":{"id":"v1_abc","status":"failed","error":{"code":"safety_blocked","message":"Blocked"}},"event_type":"interaction.completed"}\n\n`
    );
    expect(error).toBeInstanceOf(NoSpeechGeneratedError);
    expect(error).toMatchObject({
      reason: "content_refusal",
      retryable: false,
      requestId: "v1_abc",
    });
  });

  it("accepts a completed event whose optional fields are null", async () => {
    const audio = await collect(
      await streamOf(
        `${AUDIO_DELTA}event: interaction.completed\ndata: {"interaction":{"id":"v1_abc","status":"completed","error":null},"event_type":"interaction.completed"}\n\n`
      )
    );
    expect(new TextDecoder().decode(audio)).toBe("AB");
  });
});
