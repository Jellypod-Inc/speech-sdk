import { describe, expect, it, vi } from "vitest";
import { generateSpeech } from "../generate-speech.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
import { streamSpeech } from "../stream-speech.js";

function mockFetchOk(body: unknown, contentType = "audio/mpeg") {
  return vi.fn().mockResolvedValue(
    new Response(typeof body === "string" ? body : new Uint8Array([1, 2]), {
      status: 200,
      headers: { "Content-Type": contentType },
    })
  );
}

describe("gateway passthrough of pronunciations", () => {
  it("includes the pronunciations field in /audio/speech body", async () => {
    const fetchSpy = mockFetchOk(new Uint8Array([1, 2]));
    const gw = createSpeechGateway({ apiKey: "test", fetch: fetchSpy });
    await generateSpeech({
      model: gw("openai/tts-1"),
      voice: "alloy",
      text: "What is LLM?",
      pronunciations: {
        dictionaryIds: ["d1"],
        rules: [{ word: "LLM", replacement: "el el em" }],
      },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.pronunciations).toEqual({
      dictionaryIds: ["d1"],
      rules: [{ word: "LLM", replacement: "el el em" }],
    });
    expect(body.text).toBe("What is LLM?");
  });

  it("does not modify the text on the gateway path", async () => {
    const fetchSpy = mockFetchOk(new Uint8Array([1, 2]));
    const gw = createSpeechGateway({ apiKey: "test", fetch: fetchSpy });
    await generateSpeech({
      model: gw("openai/tts-1"),
      voice: "alloy",
      text: "What is LLM?",
      pronunciations: { rules: [{ word: "LLM", replacement: "el el em" }] },
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.text).toBe("What is LLM?");
  });

  it("includes pronunciations on streaming endpoint", async () => {
    const fetchSpy = mockFetchOk("");
    const gw = createSpeechGateway({ apiKey: "test", fetch: fetchSpy });
    await streamSpeech({
      model: gw("openai/tts-1"),
      voice: "alloy",
      text: "Hi",
      pronunciations: { dictionaryIds: ["d1"] },
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.pronunciations).toEqual({ dictionaryIds: ["d1"] });
  });

  it("omits the pronunciations field when caller did not pass it", async () => {
    const fetchSpy = mockFetchOk(new Uint8Array([1, 2]));
    const gw = createSpeechGateway({ apiKey: "test", fetch: fetchSpy });
    await generateSpeech({
      model: gw("openai/tts-1"),
      voice: "alloy",
      text: "Hi",
    });
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect("pronunciations" in body).toBe(false);
  });
});
