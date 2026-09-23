import { describe, expect, it, vi } from "vitest";
import { wrapPcm16Mono } from "../audio-utils.js";
import { chooseConversationPath } from "../conversation/dispatch.js";
import { generateSpeech } from "../generate-speech.js";
import {
  createGoogle,
  GoogleSpeechProvider,
} from "../providers/google/index.js";
import { preprocessSpeechText } from "../text-preprocessing.js";

const wav = new Uint8Array(48);
wav.set(new TextEncoder().encode("RIFF"), 0);
wav.set(new TextEncoder().encode("WAVE"), 8);

function interactionResponse() {
  return new Response(
    JSON.stringify({
      id: "interaction-1",
      model: "gemini-3.8-flash-tts",
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "audio",
              mime_type: "audio/wav",
              data: btoa(String.fromCharCode(...wav)),
            },
          ],
        },
      ],
    }),
    { status: 200 }
  );
}

describe("Gemini 3.8 TTS", () => {
  it("defaults to Flash-Lite", () => {
    expect(createGoogle()().modelId).toBe("gemini-3.8-flash-lite-tts");
  });
  it("uses structured transcript and style, passes custom voice, and preserves unary WAV", async () => {
    const fetch = vi.fn().mockResolvedValue(interactionResponse());
    const provider = new GoogleSpeechProvider({ apiKey: "key", fetch });
    const result = await provider.generate({
      modelId: "gemini-3.8-flash-tts",
      text: "Hello [laughs] world.",
      instructions: "warm and calm",
      voice: "voice_saved",
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.input[0].content).toEqual([
      {
        type: "text",
        text: "Hello <laugh> world.",
        annotations: [{ type: "speech_metadata", style: "warm and calm" }],
      },
    ]);
    expect(body.generation_config.speech_config).toEqual([
      { voice: "voice_saved" },
    ]);
    expect(result.audio).toEqual(wav);
    expect(result.providerMetadata).toMatchObject({
      requestId: "interaction-1",
      status: "completed",
    });
  });

  it("uses speaker annotations for two prebuilt voices and stitches custom voices", async () => {
    const fetch = vi.fn().mockResolvedValue(interactionResponse());
    const provider = new GoogleSpeechProvider({ apiKey: "key", fetch });
    await provider.generateDialogue({
      modelId: "gemini-3.8-flash-lite-tts",
      turns: [
        { voice: "Kore", text: "Hello." },
        { voice: "Puck", text: "Hi.", instructions: "cheerful" },
      ],
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.input[0].content[1].annotations[0]).toEqual({
      type: "speech_metadata",
      speaker: "Speaker2",
      style: "cheerful",
    });
    expect(body.generation_config.speech_config.speakers).toEqual([
      { speaker: "Speaker1", voice: "Kore" },
      { speaker: "Speaker2", voice: "Puck" },
    ]);
    const resolved = createGoogle({ apiKey: "key", fetch })(
      "gemini-3.8-flash-lite-tts"
    );
    const path = chooseConversationPath({
      resolvedPerTurn: [resolved, resolved],
      turns: [
        { voice: "voice_saved", text: "Hello." },
        { voice: "Puck", text: "Hi." },
      ],
    });
    expect(path.kind).toBe("stitch");
  });

  it("rejects unsupported directions rather than voicing them", async () => {
    const provider = new GoogleSpeechProvider({
      apiKey: "key",
      fetch: vi.fn(),
    });
    await expect(
      provider.generate({
        modelId: "gemini-3.8-flash-tts",
        text: "Hi [applause]",
        voice: "Kore",
      })
    ).rejects.toThrow("Unsupported Gemini 3.8 audio tag");
  });

  it("keeps vocal tags out of the alignment transcript", () => {
    const resolved = createGoogle({ apiKey: "key" })("gemini-3.8-flash-tts");
    const processed = preprocessSpeechText({
      resolved,
      rawText: "Hello [laughs] world.",
      modelIdentifier: "google/gemini-3.8-flash-tts",
    });
    expect(processed.canonicalText).toBe("Hello world.");
    expect(processed.providerText).toBe("Hello [laughs] world.");
  });

  it("streams headerless PCM from interactions", async () => {
    const sse =
      'event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"audio","mime_type":"audio/l16","data":"AAAAAA=="}}\n\n';
    const fetch = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }));
    const provider = new GoogleSpeechProvider({ apiKey: "key", fetch });
    const result = await provider.stream({
      modelId: "gemini-3.8-flash-tts",
      text: "Hello",
      voice: "Kore",
    });
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body.stream).toBe(true);
    expect(body.input[0].content[0].text).toBe("Hello");
    expect(result.mediaType).toBe("audio/pcm;rate=24000");
    const reader = result.stream.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array(4));
  });

  it("keeps chunk retries isolated and exposes ordered chunk diagnostics", async () => {
    const audio = await wrapPcm16Mono(new Uint8Array(4800), 24_000);
    const calls = new Map<string, number>();
    let active = 0;
    let peak = 0;
    const fetch = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      const line = body.input[0].content[0].text as string;
      calls.set(line, (calls.get(line) ?? 0) + 1);
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      if (line === "Four five six." && calls.get(line) === 1) {
        return new Response(
          JSON.stringify({ error: { code: 503, message: "try again" } }),
          { status: 503 }
        );
      }
      return new Response(
        JSON.stringify({
          id: `request-${line}`,
          status: "completed",
          steps: [
            {
              type: "model_output",
              content: [
                {
                  type: "audio",
                  mime_type: "audio/wav",
                  data: btoa(String.fromCharCode(...audio)),
                },
              ],
            },
          ],
        }),
        { status: 200 }
      );
    });
    const result = await generateSpeech({
      model: createGoogle({
        apiKey: "key",
        fetch: fetch as typeof globalThis.fetch,
      })("gemini-3.8-flash-tts"),
      text: "One two three. Four five six. Seven eight nine.",
      voice: "Kore",
      maxChunkWords: 3,
      maxConcurrency: 2,
      maxRetries: 1,
    });
    expect(peak).toBeLessThanOrEqual(2);
    expect([...calls.values()]).toEqual([1, 2, 1]);
    expect(result.metadata.chunks?.map((chunk) => chunk.retryCount)).toEqual([
      0, 1, 0,
    ]);
    expect(result.metadata.chunks?.map((chunk) => chunk.index)).toEqual([
      0, 1, 2,
    ]);
  });

  it("propagates cancellation to every in-flight chunk", async () => {
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const fetch = vi.fn((_url: string, init: RequestInit) => {
      const signal = init.signal as AbortSignal;
      signals.push(signal);
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const pending = generateSpeech({
      model: createGoogle({
        apiKey: "key",
        fetch: fetch as typeof globalThis.fetch,
      })("gemini-3.8-flash-tts"),
      text: "One two three. Four five six. Seven eight nine.",
      voice: "Kore",
      maxChunkWords: 3,
      maxConcurrency: 2,
      abortSignal: controller.signal,
    });
    await vi.waitFor(() => expect(signals).toHaveLength(2));
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
