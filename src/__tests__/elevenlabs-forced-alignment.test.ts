import { describe, expect, it, vi } from "vitest";
import { SpeechSdkProviderError } from "../errors.js";
import { createElevenLabs } from "../providers/elevenlabs/index.js";
import { finalizeTimestamps } from "../timestamp-finalization.js";

function successfulResponse(overrides: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      characters: [
        { text: "H", start: 0, end: 0.1 },
        { text: "i", start: 0.1, end: 0.2 },
      ],
      words: [{ text: "Hi", start: 0, end: 0.2, loss: 0.04 }],
      loss: 0.05,
      ...overrides,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("createElevenLabs().forcedAlignment()", () => {
  it("constructs the additive forced-alignment model", () => {
    const elevenlabs = createElevenLabs({ apiKey: "key" });
    const adapter = elevenlabs.forcedAlignment();

    expect(adapter.align).toBeTypeOf("function");
  });

  it("posts multipart audio and exact synthesized text", async () => {
    const fetchFn = vi.fn().mockResolvedValue(successfulResponse());
    const adapter = createElevenLabs({
      apiKey: "el-key",
      fetch: fetchFn,
    }).forcedAlignment();

    await adapter.align({
      audio: new Uint8Array([1, 2, 3]),
      mediaType: "audio/wav",
      text: "Dr. Smith paid 12 dollars",
    });

    expect(fetchFn).toHaveBeenCalledOnce();
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/forced-alignment");
    expect(init.method).toBe("POST");
    expect(init.headers["xi-api-key"]).toBe("el-key");
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("text")).toBe("Dr. Smith paid 12 dollars");
    expect(form.get("file")).toBeInstanceOf(Blob);
    expect((form.get("file") as Blob).type).toBe("audio/wav");
  });

  it("filters non-lexical entries before exact finalization", async () => {
    const text = "Tropical oceans are — actually biological deserts.";
    const fetchFn = vi.fn().mockResolvedValue(
      successfulResponse({
        words: [
          { text: "Tropical", start: 0, end: 0.4, loss: 0.04 },
          { text: " ", start: 0.4, end: 0.44, loss: 0.01 },
          { text: "oceans", start: 0.44, end: 0.8, loss: 0.04 },
          { text: " ", start: 0.8, end: 0.84, loss: 0.01 },
          { text: "are", start: 0.84, end: 1.04, loss: 0.04 },
          { text: " ", start: 1.04, end: 1.08, loss: 0.01 },
          { text: "—", start: 1.08, end: 1.12, loss: 0.01 },
          { text: " ", start: 1.12, end: 1.16, loss: 0.01 },
          { text: "actually", start: 1.16, end: 1.56, loss: 0.04 },
          { text: " ", start: 1.56, end: 1.6, loss: 0.01 },
          { text: "biological", start: 1.6, end: 2.04, loss: 0.04 },
          { text: " ", start: 2.04, end: 2.08, loss: 0.01 },
          { text: "deserts.", start: 2.08, end: 2.5, loss: 0.04 },
        ],
      })
    );
    const adapter = createElevenLabs({
      apiKey: "el-key",
      fetch: fetchFn,
    }).forcedAlignment();

    const result = await adapter.align({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
      text,
    });

    expect(result).toEqual([
      { text: "Tropical", start: 0, end: 0.4 },
      { text: "oceans", start: 0.44, end: 0.8 },
      { text: "are", start: 0.84, end: 1.04 },
      { text: "actually", start: 1.16, end: 1.56 },
      { text: "biological", start: 1.6, end: 2.04 },
      { text: "deserts.", start: 2.08, end: 2.5 },
    ]);
    expect(finalizeTimestamps({ text, timestamps: result })).toEqual({
      ok: true,
      timestamps: [
        { text: "Tropical", start: 0, end: 0.4 },
        { text: "oceans", start: 0.44, end: 0.8 },
        { text: "are —", start: 0.84, end: 1.04 },
        { text: "actually", start: 1.16, end: 1.56 },
        { text: "biological", start: 1.6, end: 2.04 },
        { text: "deserts.", start: 2.08, end: 2.5 },
      ],
    });
  });

  it("surfaces missing or empty words as an empty alignment candidate", async () => {
    const missingWordsFetch = vi
      .fn()
      .mockResolvedValue(successfulResponse({ words: undefined }));
    const missingAdapter = createElevenLabs({
      apiKey: "el-key",
      fetch: missingWordsFetch,
    }).forcedAlignment();
    const missing = await missingAdapter.align({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
      text: "Hi",
    });

    const emptyWordsFetch = vi
      .fn()
      .mockResolvedValue(successfulResponse({ words: [] }));
    const emptyAdapter = createElevenLabs({
      apiKey: "el-key",
      fetch: emptyWordsFetch,
    }).forcedAlignment();
    const empty = await emptyAdapter.align({
      audio: new Uint8Array([1]),
      mediaType: "audio/mpeg",
      text: "Hi",
    });

    expect(missing).toEqual([]);
    expect(empty).toEqual([]);
  });

  it("uses structured provider errors with the alignment stage", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "invalid audio" }), {
        status: 422,
      })
    );
    const adapter = createElevenLabs({
      apiKey: "el-key",
      fetch: fetchFn,
    }).forcedAlignment();

    const thrown = await adapter
      .align({
        audio: new Uint8Array([1]),
        mediaType: "audio/mpeg",
        text: "Hi",
      })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(SpeechSdkProviderError);
    expect(thrown).toMatchObject({
      provider: "elevenlabs",
      model: "forced-alignment",
      stage: "alignment",
      status: 422,
    });
  });
});
