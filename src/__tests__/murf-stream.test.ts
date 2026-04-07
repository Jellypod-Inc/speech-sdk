import { describe, expect, it, vi } from "vitest";
import { MurfSpeechProvider } from "../providers/murf/index.js";

describe("MurfSpeechProvider.stream", () => {
  it("POSTs to /speech/stream for GEN2", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1]));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/wav" } }
      )
    );
    const provider = new MurfSpeechProvider({
      apiKey: "mf-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "GEN2",
      text: "hi",
      voice: "en-US-natalie",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/speech/stream");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("GEN2");
    expect(body.voiceId).toBe("en-US-natalie");
    expect(result?.mediaType).toBe("audio/wav");
  });
});
