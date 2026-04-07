import { describe, expect, it, vi } from "vitest";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";

describe("ElevenLabsSpeechProvider.stream", () => {
  it("POSTs to /stream endpoint and returns response.body", async () => {
    const payload = new Uint8Array([7, 8, 9]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(payload);
            c.close();
          },
        }),
        {
          status: 200,
          headers: {
            "content-type": "audio/mpeg",
            "request-id": "req-123",
          },
        }
      )
    );

    const provider = new ElevenLabsSpeechProvider({
      apiKey: "xi-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream!({
      modelId: "eleven_multilingual_v2",
      text: "hi",
      voice: "voice-abc",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/v1/text-to-speech/voice-abc/stream");
    expect(result.mediaType).toBe("audio/mpeg");
    expect(result.providerMetadata).toEqual({ requestId: "req-123" });
  });

  it("requires a voice", async () => {
    const provider = new ElevenLabsSpeechProvider({ apiKey: "xi-test" });
    await expect(
      provider.stream!({ modelId: "eleven_multilingual_v2", text: "hi" })
    ).rejects.toThrow(/voice ID/);
  });
});
