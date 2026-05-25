import { describe, expect, it, vi } from "vitest";
import { CartesiaSpeechProvider } from "../providers/cartesia/index.js";
import { DeepgramSpeechProvider } from "../providers/deepgram/index.js";
import { ElevenLabsSpeechProvider } from "../providers/elevenlabs/index.js";
import { HumeSpeechProvider } from "../providers/hume/index.js";
import { OpenAISpeechProvider } from "../providers/openai/index.js";
import { XaiSpeechProvider } from "../providers/xai/index.js";

const XAI_MODEL_ID = "grok-tts";

const RATE_PARAM_RE = /rate=\d+/;
const CONTAINER_WAV_RE = /container=wav/;

function mockArrayBufferResponse(contentType: string | null) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(contentType ? { "content-type": contentType } : {}),
    arrayBuffer: async () => new Uint8Array([1, 2, 3, 4]).buffer,
  });
}

function mockStreamResponse(contentType: string | null) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(contentType ? { "content-type": contentType } : {}),
    body: new ReadableStream({
      start(c) {
        c.enqueue(new Uint8Array([1, 2, 3, 4]));
        c.close();
      },
    }),
  });
}

describe("xAI: PCM responses always carry rate", () => {
  it("generate() returns audio/pcm with rate when codec=pcm + sample_rate set", async () => {
    const fetch = mockArrayBufferResponse("audio/pcm");
    const provider = new XaiSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: XAI_MODEL_ID,
      text: "hi",
      providerOptions: {
        output_format: { codec: "pcm", sample_rate: 48_000 },
      },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=48000");
  });

  it("stream() returns audio/pcm with rate when codec=pcm + sample_rate set", async () => {
    const fetch = mockStreamResponse("audio/pcm");
    const provider = new XaiSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.stream({
      modelId: XAI_MODEL_ID,
      text: "hi",
      providerOptions: {
        output_format: { codec: "pcm", sample_rate: 24_000 },
      },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=24000");
  });
});

describe("Hume: PCM responses always carry rate", () => {
  it("generate() returns audio/pcm;rate=48000 when format.type=pcm, ignoring bare Content-Type", async () => {
    const fetch = mockArrayBufferResponse("audio/pcm");
    const provider = new HumeSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "octave-2",
      text: "hi",
      providerOptions: { format: { type: "pcm" } },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=48000");
  });

  it("stream() returns audio/pcm;rate=48000 when format.type=pcm", async () => {
    const fetch = mockStreamResponse("audio/pcm");
    const provider = new HumeSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.stream({
      modelId: "octave-2",
      text: "hi",
      providerOptions: { format: { type: "pcm" } },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=48000");
  });

  it("generate() still trusts Content-Type for non-PCM formats (wav)", async () => {
    const fetch = mockArrayBufferResponse("audio/wav");
    const provider = new HumeSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({ modelId: "octave-2", text: "hi" });
    expect(r.mediaType).toBe("audio/wav");
  });
});

describe("ElevenLabs generateDialogue: PCM responses always carry rate", () => {
  it("derives rate from output_format=pcm_44100 even when API returns bare audio/pcm", async () => {
    const fetch = mockArrayBufferResponse("audio/pcm");
    const provider = new ElevenLabsSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generateDialogue({
      modelId: "eleven_v3",
      turns: [{ voice: "v1", text: "hi" }],
      providerOptions: { output_format: "pcm_44100" },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=44100");
  });
});

describe("Cartesia: raw container responses always carry rate", () => {
  it("generate() returns audio/pcm with rate for container=raw + pcm_s16le", async () => {
    const fetch = mockArrayBufferResponse("application/octet-stream");
    const provider = new CartesiaSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "sonic-2",
      text: "hi",
      voice: "v1",
      providerOptions: {
        output_format: {
          container: "raw",
          encoding: "pcm_s16le",
          sample_rate: 48_000,
        },
      },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=48000");
  });

  it("generate() returns float32-tagged pcm for container=raw + pcm_f32le", async () => {
    const fetch = mockArrayBufferResponse("application/octet-stream");
    const provider = new CartesiaSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "sonic-2",
      text: "hi",
      voice: "v1",
      providerOptions: {
        output_format: {
          container: "raw",
          encoding: "pcm_f32le",
          sample_rate: 24_000,
        },
      },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=24000;encoding=float32");
  });

  it("generate() still reports audio/wav when container=wav (default)", async () => {
    const fetch = mockArrayBufferResponse("audio/wav");
    const provider = new CartesiaSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "sonic-2",
      text: "hi",
      voice: "v1",
    });
    expect(r.mediaType).toBe("audio/wav");
  });
});

describe("OpenAI: PCM responses always carry rate", () => {
  it("generate() returns audio/pcm;rate=24000 when response_format=pcm", async () => {
    const fetch = mockArrayBufferResponse("audio/pcm");
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "tts-1",
      text: "hi",
      voice: "alloy",
      providerOptions: { response_format: "pcm" },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=24000");
  });

  it("stream() returns audio/pcm;rate=24000 when response_format=pcm", async () => {
    const fetch = mockStreamResponse("audio/pcm");
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch });
    const r = await provider.stream({
      modelId: "tts-1",
      text: "hi",
      voice: "alloy",
      providerOptions: { response_format: "pcm" },
    });
    expect(r.mediaType).toBe("audio/pcm;rate=24000");
  });

  it("generate() trusts Content-Type when response_format is not set", async () => {
    const fetch = mockArrayBufferResponse("audio/mpeg");
    const provider = new OpenAISpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "tts-1",
      text: "hi",
      voice: "alloy",
    });
    expect(r.mediaType).toBe("audio/mpeg");
  });
});

describe("Deepgram: linear16 responses require container=wav", () => {
  it("generate() returns audio/wav when encoding=linear16 + container=wav", async () => {
    const fetch = mockArrayBufferResponse("audio/wav");
    const provider = new DeepgramSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "aura-2",
      text: "hi",
      providerOptions: {
        encoding: "linear16",
        container: "wav",
        sample_rate: 48_000,
      },
    });
    expect(r.mediaType).toBe("audio/wav");
  });

  it("generate() emits audio/l16 with rate when encoding=linear16 without container (sample_rate provided)", async () => {
    const fetch = mockArrayBufferResponse("audio/l16;rate=24000");
    const provider = new DeepgramSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: "aura-2",
      text: "hi",
      providerOptions: { encoding: "linear16", sample_rate: 24_000 },
    });
    expect(r.mediaType).toBe("audio/l16;rate=24000");
  });

  it("generate() throws when encoding=linear16 without container AND without sample_rate", async () => {
    const fetch = mockArrayBufferResponse(null);
    const provider = new DeepgramSpeechProvider({ apiKey: "k", fetch });
    await expect(
      provider.generate({
        modelId: "aura-2",
        text: "hi",
        providerOptions: { encoding: "linear16" },
      })
    ).rejects.toThrow(CONTAINER_WAV_RE);
  });
});

describe("decoder + provider integration: end-to-end rate enforcement", () => {
  it("xAI PCM bytes are decodable end-to-end via decodeAudioToPcm16", async () => {
    const audio = new Uint8Array(
      new Int16Array(2400).map((_, i) => Math.round(Math.sin(i / 10) * 16_000))
        .buffer
    );
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "audio/pcm" }),
      arrayBuffer: async () => audio.buffer,
    });
    const provider = new XaiSpeechProvider({ apiKey: "k", fetch });
    const r = await provider.generate({
      modelId: XAI_MODEL_ID,
      text: "hi",
      providerOptions: {
        output_format: { codec: "pcm", sample_rate: 24_000 },
      },
    });
    // The whole point: emitted mediaType has rate, so decoder doesn't throw.
    expect(r.mediaType).toMatch(RATE_PARAM_RE);
    const { decodeAudioToPcm16 } = await import("../audio-decode.js");
    const decoded = await decodeAudioToPcm16(r.audio, r.mediaType);
    expect(decoded.sampleRate).toBe(24_000);
  });
});
