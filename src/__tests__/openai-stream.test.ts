import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../errors.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";

function bodyStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes);
      c.close();
    },
  });
}

describe("OpenAISpeechProvider.stream", () => {
  it("POSTs to /audio/speech and returns response.body", async () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(bodyStream(payload), {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      })
    );

    const provider = new OpenAISpeechProvider({
      apiKey: "sk-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const result = await provider.stream?.({
      modelId: "tts-1",
      text: "hi",
      voice: "alloy",
    });

    expect(result.mediaType).toBe("audio/mpeg");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/audio/speech");
    expect((init as RequestInit).method).toBe("POST");

    const reader = result.stream.getReader();
    const { value } = await reader.read();
    expect(value).toEqual(payload);
  });

  it("throws ApiError on non-2xx", async () => {
    const responseBody = '{"error":{"message":"nope"}}';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(responseBody, {
        status: 401,
        headers: { "content-type": "application/json" },
      })
    );
    const provider = new OpenAISpeechProvider({
      apiKey: "sk-test",
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });

    const error = await provider
      .stream?.({ modelId: "tts-1", text: "hi", voice: "alloy" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.statusCode).toBe(401);
    expect(apiError.responseBody).toBe(responseBody);
    expect(apiError.message).toContain("nope");
  });
});
