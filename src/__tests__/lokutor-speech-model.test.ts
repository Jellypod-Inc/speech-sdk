import { describe, expect, it, vi } from "vitest";
import { UnsupportedSampleRateError } from "../errors.js";
import { LokutorSpeechProvider } from "../providers/lokutor/index.js";
import { resolveModel } from "../resolve-provider.js";

const WAV = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0]);

function providerWithMock() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(WAV, {
      headers: { "Content-Type": "audio/wav" },
    })
  );
  return {
    provider: new LokutorSpeechProvider({
      apiKey: "sk-test",
      fetch: fetchMock,
    }),
    fetchMock,
  };
}

describe("LokutorSpeechProvider", () => {
  it("resolves default and explicit model strings", () => {
    expect(resolveModel("lokutor").modelId).toBe("versa-2.0");
    expect(resolveModel("lokutor/versa-2.0").provider.id).toBe("lokutor");
  });

  it("sends canonical REST fields and bearer auth, then returns WAV bytes", async () => {
    const { provider, fetchMock } = providerWithMock();
    const result = await provider.generate({
      modelId: "versa-2.0",
      text: "Hola",
      voice: "F4",
      providerOptions: { language: "es", steps: 4 },
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.lokutor.com/tts/synthesize");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body)).toEqual({
      text: "Hola",
      voice: "F4",
      language: "es",
      steps: 4,
    });
    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio).toEqual(WAV);
  });

  it("uses documented default voice, language and steps", async () => {
    const { provider, fetchMock } = providerWithMock();
    await provider.generate({ modelId: "versa-2.0", text: "Hello" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      text: "Hello",
      voice: "F1",
      language: "en",
      steps: 6,
    });
  });

  it("rejects invalid model, language and steps before a request", async () => {
    const { provider, fetchMock } = providerWithMock();
    await expect(
      provider.generate({ modelId: "old", text: "Hi" })
    ).rejects.toThrow("unknown model");
    await expect(
      provider.generate({
        modelId: "versa-2.0",
        text: "Hi",
        providerOptions: { language: "bn" },
      })
    ).rejects.toThrow("language");
    await expect(
      provider.generate({
        modelId: "versa-2.0",
        text: "Hi",
        providerOptions: { steps: 9 },
      })
    ).rejects.toThrow("steps");
    await expect(
      provider.generate({
        modelId: "versa-2.0",
        text: "Hi",
        providerOptions: { speed: 1.5 },
      })
    ).rejects.toThrow("unsupported provider options");
    await expect(
      provider.generate({ modelId: "versa-2.0", text: " ", voice: "F1" })
    ).rejects.toThrow("text must contain");
    await expect(
      provider.generate({ modelId: "versa-2.0", text: "Hi", voice: "" })
    ).rejects.toThrow("voice must not be empty");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses WAV for requested output and stitch, enforcing native 44.1k rate", () => {
    const { provider } = providerWithMock();
    expect(provider.getStitchOptions("versa-2.0")).toEqual({
      providerOptions: {},
      mediaType: "audio/wav",
    });
    expect(
      provider.resolveOutputFormat("versa-2.0", { format: "mp3" })
    ).toEqual({ providerOptions: {}, expectedMediaType: "audio/wav" });
    expect(() =>
      provider.resolveOutputFormat("versa-2.0", {
        format: "wav",
        sampleRate: 24_000,
      })
    ).toThrow(UnsupportedSampleRateError);
    expect(
      provider.resolveOutputFormat("unknown", { format: "wav" })
    ).toBeUndefined();
  });

  it("maps HTTP errors through the shared provider handler", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '{"error":{"code":"billing.limit_reached","message":"Limit reached"}}',
          { status: 402 }
        )
      );
    const provider = new LokutorSpeechProvider({
      apiKey: "sk-test",
      fetch: fetchMock,
    });
    await expect(
      provider.generate({ modelId: "versa-2.0", text: "Hi" })
    ).rejects.toThrow("Limit reached");
  });
});
