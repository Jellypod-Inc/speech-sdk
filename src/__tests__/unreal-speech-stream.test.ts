import { describe, expect, it, vi } from "vitest";
import { UnrealSpeechProvider } from "../providers/unreal-speech/index.js";

describe("UnrealSpeechProvider.stream", () => {
  it("POSTs to /stream and returns streaming body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array([1, 2]));
            c.close();
          },
        }),
        { status: 200, headers: { "content-type": "audio/mpeg" } }
      )
    );
    const provider = new UnrealSpeechProvider({
      apiKey: "us-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
    const result = await provider.stream?.({
      modelId: "default",
      text: "hi",
      voice: "Sierra",
    });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/stream");
    expect(result?.mediaType).toBe("audio/mpeg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
