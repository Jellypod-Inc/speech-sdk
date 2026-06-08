import { describe, expect, it, vi } from "vitest";
import {
  FEATURES,
  type ResolvedModel,
  type SpeechProvider,
} from "../speech-provider.js";
import { streamSpeech } from "../stream-speech.js";

const EL_EL_EM_RE = /el el em/;
const PAUSE_TAG_RE = /\[pause\]/;

function fakeStreamingModel(
  spy: ReturnType<typeof vi.fn>
): ResolvedModel<string> {
  const provider: SpeechProvider<string, string> = {
    id: "fake",
    defaultModel: "f1",
    models: [{ id: "f1", features: [FEATURES.STREAMING] }],
    generate: vi.fn(),
    stream: spy,
  };
  return { provider, modelId: "f1" } as ResolvedModel<string>;
}

describe("streamSpeech with pronunciations", () => {
  it("substitutes rules into the text sent to the provider", async () => {
    const streamSpy = vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
      mediaType: "audio/mpeg",
    });
    await streamSpeech({
      model: fakeStreamingModel(streamSpy),
      voice: "v1",
      text: "What is LLM?",
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(streamSpy.mock.calls[0][0].text).toBe("What is el el em?");
  });

  it("strips audio tags before substituting", async () => {
    const streamSpy = vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
      mediaType: "audio/mpeg",
    });
    await streamSpeech({
      model: fakeStreamingModel(streamSpy),
      voice: "v1",
      // Audio tags use [bracket] syntax in this codebase
      text: "Say LLM [pause] and LLM",
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });
    const sentText = streamSpy.mock.calls[0][0].text;
    expect(sentText).toMatch(EL_EL_EM_RE);
    expect(sentText).not.toMatch(PAUSE_TAG_RE);
  });

  it("is a no-op when pronunciations is undefined", async () => {
    const streamSpy = vi.fn().mockResolvedValue({
      stream: new ReadableStream(),
      mediaType: "audio/mpeg",
    });
    await streamSpeech({
      model: fakeStreamingModel(streamSpy),
      voice: "v1",
      text: "Plain text",
    });
    expect(streamSpy.mock.calls[0][0].text).toBe("Plain text");
  });
});
