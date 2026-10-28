import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingApiKeyError, SpeechSdkProviderError } from "../errors.js";
import { createElevenLabs } from "../providers/elevenlabs/index.js";
import { GoogleSpeechProvider } from "../providers/google/index.js";
import { createVercelAIGatewayClient } from "../vercel-ai-gateway-client.js";

const wav = new Uint8Array(48);
wav.set(new TextEncoder().encode("RIFF"), 0);
wav.set(new TextEncoder().encode("WAVE"), 8);
const wavBase64 = btoa(String.fromCharCode(...wav));

function speechResponse(audio = wavBase64) {
  return new Response(
    JSON.stringify({
      audio,
      warnings: [],
      providerMetadata: { gateway: { routing: { finalProvider: "vertex" } } },
    }),
    { status: 200 }
  );
}

function gatewayGoogle(fetch: typeof globalThis.fetch) {
  const client = createVercelAIGatewayClient({
    apiKey: "gateway-key",
    fetch,
    order: { google: ["vertex", "google"] },
  });
  return new GoogleSpeechProvider({ client });
}

function requestOf(fetch: ReturnType<typeof vi.fn>, call = 0) {
  const [url, init] = fetch.mock.calls[call] as [string, RequestInit];
  return {
    url,
    headers: init.headers as Record<string, string>,
    body: JSON.parse(init.body as string),
  };
}

describe("VercelAIGatewayClient", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sends Gemini 3.8 speech to the gateway with the provider's routing order", async () => {
    const fetch = vi.fn().mockResolvedValue(speechResponse());
    const result = await gatewayGoogle(fetch).generate({
      modelId: "gemini-3.8-flash-tts",
      text: "Hello [laughs] world.",
      instructions: "warm",
      voice: "Kore",
    });

    const { url, headers, body } = requestOf(fetch);
    expect(url).toBe("https://ai-gateway.vercel.sh/v4/ai/speech-model");
    expect(headers).toMatchObject({
      Authorization: "Bearer gateway-key",
      "ai-gateway-protocol-version": "0.0.1",
      "ai-speech-model-specification-version": "4",
      "ai-model-id": "google/gemini-3.8-flash-tts",
    });
    expect(body).toEqual({
      text: "Hello <laughs> world.",
      voice: "Kore",
      outputFormat: "wav",
      providerOptions: {
        google: { speechMetadata: { style: "warm" } },
        gateway: { order: ["vertex", "google"] },
      },
    });
    expect(result.mediaType).toBe("audio/wav");
    expect(result.audio).toEqual(wav);
    expect(result.providerMetadata).toMatchObject({
      gateway: { routing: { finalProvider: "vertex" } },
    });
  });

  it("sends dialogue as speaker turns beside a non-empty transcript", async () => {
    const fetch = vi.fn().mockResolvedValue(speechResponse());
    await gatewayGoogle(fetch).generateDialogue({
      modelId: "gemini-3.8-flash-tts",
      turns: [
        { voice: "Kore", text: "What are we exploring?" },
        { voice: "Puck", text: "Speech.", instructions: "cheerful" },
      ],
    });

    const { body } = requestOf(fetch);
    expect(body.text).toBe("What are we exploring? Speech.");
    expect(body.voice).toBeUndefined();
    expect(body.providerOptions.google).toEqual({
      multiSpeakerVoiceConfig: {
        speakerVoiceConfigs: [
          {
            speaker: "Speaker1",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
          },
          {
            speaker: "Speaker2",
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } },
          },
        ],
      },
      turns: [
        {
          text: "What are we exploring?",
          speechMetadata: { speaker: "Speaker1" },
        },
        {
          text: "Speech.",
          speechMetadata: { speaker: "Speaker2", style: "cheerful" },
        },
      ],
    });
  });

  it("streams the whole clip as one PCM chunk and declares dialogue non-streaming", async () => {
    const pcm = new Uint8Array([1, 2, 3, 4]);
    const fetch = vi
      .fn()
      .mockResolvedValue(speechResponse(btoa(String.fromCharCode(...pcm))));
    const provider = gatewayGoogle(fetch);

    const { stream, mediaType } = await provider.stream({
      modelId: "gemini-3.8-flash-tts",
      text: "Hi.",
    });

    expect(requestOf(fetch).body.outputFormat).toBe("pcm");
    expect(mediaType).toBe("audio/pcm;rate=24000");
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([pcm]);
    expect(
      provider.dialogueCapabilities("gemini-3.8-flash-tts")?.streaming
    ).toBe(false);
  });

  it("rejects Google models the gateway does not serve", async () => {
    const fetch = vi.fn();
    await expect(
      gatewayGoogle(fetch).generate({
        modelId: "gemini-2.5-flash-preview-tts",
        text: "Hi.",
      })
    ).rejects.toThrow("not served by Vercel AI Gateway");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces gateway errors as provider errors with their status", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "Speech input must contain a non-empty transcript",
            type: "invalid_request_error",
          },
        }),
        { status: 400 }
      )
    );
    const error = await gatewayGoogle(fetch)
      .generate({ modelId: "gemini-3.8-flash-tts", text: "Hi." })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(SpeechSdkProviderError);
    expect(error).toMatchObject({ status: 400, retryable: false });
  });

  it("resolves the key from a function, then the environment", async () => {
    const fetch = vi.fn().mockImplementation(() => speechResponse());
    const viaFunction = createVercelAIGatewayClient({
      apiKey: () => Promise.resolve("oidc-token"),
      fetch,
    });
    await viaFunction.speech({
      provider: "google",
      model: "google/gemini-3.8-flash-tts",
      text: "Hi.",
    });
    expect(requestOf(fetch).headers.Authorization).toBe("Bearer oidc-token");

    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    vi.stubEnv("VERCEL_OIDC_TOKEN", "env-oidc");
    await createVercelAIGatewayClient({ fetch }).speech({
      provider: "google",
      model: "google/gemini-3.8-flash-tts",
      text: "Hi.",
    });
    expect(requestOf(fetch, 1).headers.Authorization).toBe("Bearer env-oidc");

    vi.stubEnv("VERCEL_OIDC_TOKEN", "");
    await expect(
      createVercelAIGatewayClient({ fetch }).speech({
        provider: "google",
        model: "google/gemini-3.8-flash-tts",
        text: "Hi.",
      })
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("transcribes with Scribe through the gateway and keeps only timed words", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: "Hi there.",
          providerMetadata: {
            elevenlabs: {
              words: [
                { text: "Hi", type: "word", start: 0.36, end: 0.52 },
                { text: " ", type: "spacing", start: 0.52, end: 0.56 },
                { text: "there.", type: "word", start: 0.56, end: 0.78 },
              ],
            },
          },
        }),
        { status: 200 }
      )
    );
    const elevenLabs = createElevenLabs({
      client: createVercelAIGatewayClient({ apiKey: "gateway-key", fetch }),
    });

    const words = await elevenLabs.transcription().transcribe({
      audio: wav,
      mediaType: "audio/wav",
    });

    const { url, headers, body } = requestOf(fetch);
    expect(url).toBe("https://ai-gateway.vercel.sh/v4/ai/transcription-model");
    expect(headers["ai-model-id"]).toBe("elevenlabs/scribe-v2");
    expect(headers["ai-transcription-model-specification-version"]).toBe("4");
    expect(body).toEqual({
      audio: wavBase64,
      mediaType: "audio/wav",
      providerOptions: { elevenlabs: { tagAudioEvents: false } },
    });
    expect(words).toEqual([
      { text: "Hi", start: 0.36, end: 0.52 },
      { text: "there.", start: 0.56, end: 0.78 },
    ]);
  });
});
