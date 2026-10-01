import { createServer } from "node:http";
import { vi } from "vitest";
import { decodeAudioToPcm16 } from "../audio-decode.js";
import { uint8ArrayToBase64, wrapPcm16Mono } from "../audio-utils.js";
import {
  generateConversation,
  generateSpeech,
  streamSpeech,
} from "../index.js";
import { createSixtyDB } from "../providers.js";
import { resolveModel } from "../resolve-provider.js";

const VOICE = "038cf0d1-eef8-45a6-81b0-99c5e57a33d2";
const PCM = new Uint8Array([255, 255, 2, 0, 3, 0, 4, 0]);
const ENCODED = uint8ArrayToBase64(PCM);

function jsonResponse(data: unknown) {
  return Response.json(data);
}

function ndjsonResponse(records: unknown[]) {
  return new Response(
    records.map((record) => JSON.stringify(record)).join("\n"),
    {
      headers: { "content-type": "application/x-ndjson" },
    }
  );
}

describe("60db synthesis", () => {
  it("does not repeat a billed synthesis after an invalid successful response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => jsonResponse({ success: false }));
    const model = createSixtyDB({ apiKey: "test-key", fetch })();
    await expect(
      generateSpeech({ model, text: "Hello", voice: VOICE })
    ).rejects.toMatchObject({ retryable: false, status: 200 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("cancels an unfinished HTTP response when the consumer stops reading", async () => {
    const closed = Promise.withResolvers<void>();
    const server = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/x-ndjson" });
      response.write(
        `${JSON.stringify({ result: { audioContent: ENCODED } })}\n`
      );
      response.on("close", () => closed.resolve());
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected TCP listener");
      }
      const model = createSixtyDB({
        apiKey: "test-key",
        baseURL: `http://127.0.0.1:${address.port}`,
      })();
      const result = await streamSpeech({
        model,
        text: "Hello",
        voice: VOICE,
        maxRetries: 0,
      });
      const reader = result.audio.getReader();
      expect((await reader.read()).value).toEqual(PCM);
      await reader.cancel();
      await closed.promise;
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("converts LINEAR16 into MP3 through the existing encoder", async () => {
    const audio = new Uint8Array(4800);
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ audio_base64: uint8ArrayToBase64(audio) })
        ),
    })();
    const result = await generateSpeech({
      model,
      text: "Hello",
      voice: VOICE,
      maxRetries: 0,
      output: { format: "mp3", sampleRate: 24_000 },
    });
    expect(result.audio.mediaType).toBe("audio/mpeg");
    expect(result.audio.uint8Array.byteLength).toBeGreaterThan(0);
  });
  it("resolves string models and serializes workspace authentication and synthesis options", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        audio_base64: ENCODED,
        sample_rate: 24_000,
      })
    );
    const model = createSixtyDB({ apiKey: "test-key", fetch })();
    const result = await generateSpeech({
      model,
      text: "Hello",
      voice: VOICE,
      maxRetries: 0,
      providerOptions: { target_language: "hi", speed: 1.2 },
      headers: { authorization: "override", "content-type": "text/plain" },
    });
    expect(resolveModel("sixtydb").modelId).toBe("tts");
    expect(resolveModel("sixtydb/tts").provider.id).toBe("sixtydb");
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.60db.ai/tts-synthesize");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer test-key"
    );
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "Hello",
      voice_id: VOICE,
      audio_config: { audio_encoding: "LINEAR16", sample_rate_hertz: 24_000 },
      target_language: "hi",
      speed: 1.2,
      timestamp_type: "NONE",
    });
    expect(result.audio.mediaType).toBe("audio/wav");
    const decoded = await decodeAudioToPcm16(
      result.audio.uint8Array,
      result.audio.mediaType
    );
    expect(decoded.sampleRate).toBe(24_000);
    expect([...decoded.pcm]).toEqual([-1, 2, 3, 4]);
  });

  it("normalizes nested NDJSON audio and preserves chunk order", async () => {
    const nested = uint8ArrayToBase64(
      new TextEncoder().encode(
        JSON.stringify({ result: { audioContent: ENCODED } })
      )
    );
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          ndjsonResponse([
            { type: "meta" },
            { result: { audioContent: nested } },
            { result: { audioContent: ENCODED } },
          ])
        ),
    })();
    const result = await generateSpeech({
      model,
      text: "Hello",
      voice: VOICE,
      maxRetries: 0,
      output: { format: "pcm", sampleRate: 16_000 },
    });
    expect([...result.audio.uint8Array]).toEqual([...PCM, ...PCM]);
    expect(result.audio.mediaType).toBe("audio/pcm;rate=16000");
  });

  it("converts a JSON WAV response to the requested PCM without retaining its header", async () => {
    const wav = await wrapPcm16Mono(PCM, 24_000);
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          backendResponse: {
            success: true,
            audio_base64: uint8ArrayToBase64(wav),
            encoding: "wav",
          },
        })
      ),
    })();
    const result = await generateSpeech({
      model,
      text: "Hello",
      voice: VOICE,
      maxRetries: 0,
      output: { format: "pcm", sampleRate: 24_000 },
    });
    expect(result.audio.uint8Array).toEqual(PCM);
  });

  it("stitches conversation turns through the real SDK output pipeline", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => jsonResponse({ audio_base64: ENCODED }));
    const model = createSixtyDB({ apiKey: "test-key", fetch })();
    const result = await generateConversation({
      model,
      turns: [
        { text: "Hello", voice: VOICE },
        { text: "Goodbye", voice: VOICE },
      ],
      gapMs: 0,
      volumeDbfs: 0,
      maxRetries: 0,
      output: { format: "wav", sampleRate: 24_000 },
    });
    expect(result.metadata.path).toBe("stitch");
    expect(result.audio.mediaType).toBe("audio/wav");
    expect(fetch).toHaveBeenCalledTimes(2);
    const decoded = await decodeAudioToPcm16(
      result.audio.uint8Array,
      result.audio.mediaType
    );
    expect(decoded.pcm.length).toBe(8);
  });

  it("returns the first streamed audio before the response finishes and propagates late errors", async () => {
    let source: ReadableStreamDefaultController<Uint8Array> | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        source = controller;
      },
    });
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(
        new Response(body, {
          headers: { "content-type": "application/x-ndjson" },
        })
      ),
    })();
    const result = await streamSpeech({
      model,
      text: "Hello",
      voice: VOICE,
      maxRetries: 0,
    });
    const reader = result.audio.getReader();
    source?.enqueue(
      new TextEncoder().encode(
        `${JSON.stringify({ result: { audioContent: ENCODED } })}\n`
      )
    );
    expect((await reader.read()).value).toEqual(PCM);
    expect(result.mediaType).toBe(
      "audio/pcm;rate=24000;channels=1;encoding=s16"
    );
    source?.enqueue(
      new TextEncoder().encode(JSON.stringify({ success: false }))
    );
    source?.close();
    await expect(reader.read()).rejects.toThrow("synthesis failed");
  });

  it.each([
    { success: false },
    { backendResponse: { success: false, audio_base64: ENCODED } },
    { audio_base64: "invalid%" },
    { audio_base64: "AQ==" },
    { audio_base64: ENCODED, sample_rate: 48_000 },
    { audio_base64: ENCODED, encoding: "mp3" },
    { result: { success: false, audioContent: ENCODED } },
    { audio_base64: ENCODED, output_format: "mp3" },
    { type: "error" },
    { type: "meta" },
    [],
  ])("rejects invalid synthesis responses: %j", async (record) => {
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi.fn().mockResolvedValue(jsonResponse(record)),
    })();
    await expect(
      generateSpeech({ model, text: "Hello", voice: VOICE, maxRetries: 0 })
    ).rejects.toThrow();
  });

  it("rejects a final NDJSON error instead of returning earlier audio", async () => {
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(
          ndjsonResponse([
            { result: { audioContent: ENCODED } },
            { type: "error" },
          ])
        ),
    })();
    await expect(
      generateSpeech({ model, text: "Hello", voice: VOICE, maxRetries: 0 })
    ).rejects.toThrow("synthesis failed");
  });

  it("rejects unsupported voice, model and encoding before fetching", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const factory = createSixtyDB({ apiKey: "test-key", fetch });
    await expect(
      factory().provider.generate({
        modelId: "tts",
        text: "Hello",
        voice: "voice-name",
      })
    ).rejects.toThrow("UUID");
    await expect(
      factory().provider.generate({
        modelId: "unknown",
        text: "Hello",
        voice: VOICE,
      })
    ).rejects.toThrow("model");
    await expect(
      factory().provider.generate({
        modelId: "tts",
        text: "Hello",
        voice: VOICE,
        providerOptions: { audio_config: { audio_encoding: "OGG_OPUS" } },
      })
    ).rejects.toThrow("LINEAR16");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("propagates HTTP errors using the shared provider error contract", async () => {
    const model = createSixtyDB({
      apiKey: "test-key",
      fetch: vi
        .fn()
        .mockResolvedValue(new Response("Unauthorized", { status: 401 })),
    })();
    await expect(
      generateSpeech({ model, text: "Hello", voice: VOICE, maxRetries: 0 })
    ).rejects.toMatchObject({
      statusCode: 401,
      provider: "sixtydb",
      retryable: false,
    });
  });
});
