import { describe, expect, it, vi } from "vitest";
import { decodeAudioToPcm16 } from "../audio-decode.js";
import { generateConversation } from "../generate-conversation.js";
import { generateSpeech } from "../generate-speech.js";
import { createElevenLabs } from "../providers/elevenlabs/index.js";
import type { SpeechProvider } from "../speech-provider.js";
import {
  removePcm16Spans,
  spokenTagSpans,
  tagPhrases,
} from "../spoken-tags.js";
import type { WordTimestamp } from "../timestamps.js";
import type { TranscriptionProvider } from "../transcription-provider.js";

const RATE = 1000;
const OUTPUT_FORMAT = /output_format=pcm_(\d+)/;
const TEXT =
  "was a daring dream. [curious] In 1962, Britain signed. [thoughtfully] Engineers were curious.";

function heard(...words: [string, number, number][]): WordTimestamp[] {
  return words.map(([text, start, end]) => ({ text, start, end }));
}

const HEARD = heard(
  ["was", 0, 0.2],
  ["a", 0.3, 0.4],
  ["daring", 0.5, 0.9],
  ["dream.", 1, 1.4],
  ["Curious.", 2, 2.6],
  ["In", 3.4, 3.5],
  ["1962,", 3.6, 4.4],
  ["Britain", 4.5, 4.9],
  ["signed.", 5, 5.4],
  ["Engineers", 5.6, 6.2],
  ["were", 6.3, 6.5],
  ["curious.", 6.6, 7.2]
);

function constantPcm(seconds: number, value = 1000): Int16Array {
  return new Int16Array(Math.round(seconds * RATE)).fill(value);
}

function taggedProvider(pcm: Int16Array): SpeechProvider {
  return {
    id: "fake",
    defaultModel: "m",
    models: [
      {
        id: "m",
        releaseDate: "2025-01-01",
        languages: ["en"],
        features: ["audio-tags"],
      },
    ],
    processAudioTags: (text) => ({ text, warnings: [] }),
    getStitchOptions: () => ({
      providerOptions: {},
      mediaType: `audio/pcm;rate=${RATE}`,
    }),
    generate: vi.fn(() =>
      Promise.resolve({
        audio: new Uint8Array(pcm.slice().buffer),
        mediaType: `audio/pcm;rate=${RATE}`,
      })
    ),
  };
}

function transcriber(words: readonly WordTimestamp[]) {
  const transcribe = vi.fn(() => Promise.resolve(words));
  return { transcribe } satisfies TranscriptionProvider;
}

async function decodedSeconds(audio: Uint8Array, mediaType: string) {
  const { pcm, sampleRate } = await decodeAudioToPcm16(audio, mediaType);
  return pcm.length / sampleRate;
}

describe("spokenTagSpans", () => {
  it("cuts a tag read aloud but keeps the same word where the script says it", () => {
    const spans = spokenTagSpans({
      duration: 8,
      heard: HEARD,
      phrases: tagPhrases(TEXT),
      text: TEXT,
    });

    expect(spans).toEqual([{ startSeconds: 1.7, endSeconds: 3 }]);
  });

  it("cuts a whole multi-word tag phrase, short words included", () => {
    const text = "Hello there. [a little sad] Goodbye.";
    const spans = spokenTagSpans({
      duration: 4,
      heard: heard(
        ["Hello", 0, 0.4],
        ["there.", 0.5, 0.9],
        ["A", 1.1, 1.2],
        ["little", 1.3, 1.6],
        ["sad.", 1.7, 2],
        ["Goodbye.", 2.4, 3]
      ),
      phrases: tagPhrases(text),
      text,
    });

    expect(spans).toEqual([{ startSeconds: 1, endSeconds: 2.2 }]);
  });
});

describe("removePcm16Spans", () => {
  it("removes exactly the span's frames and fades each side of the join", () => {
    const pcm = constantPcm(1);
    const out = removePcm16Spans(pcm, RATE, [
      { startSeconds: 0.4, endSeconds: 0.6 },
    ]);

    expect(out.length).toBe(pcm.length - 200);
    // 4 ms at 1 kHz is 4 frames: gain 0, 1/4, 2/4, 3/4 toward the join.
    expect([...out.subarray(396, 404)]).toEqual([
      750, 500, 250, 0, 0, 250, 500, 750,
    ]);
    expect(out[395]).toBe(1000);
    expect(out[404]).toBe(1000);
  });
});

describe("generateSpeech spokenTagCheck", () => {
  it("splices a spoken tag out of the audio and reports it", async () => {
    const provider = transcriber(HEARD);
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
      voice: "v",
      text: TEXT,
      spokenTagCheck: provider,
    });

    expect(provider.transcribe).toHaveBeenCalledOnce();
    expect(
      await decodedSeconds(result.audio.uint8Array, result.audio.mediaType)
    ).toBeCloseTo(6.7, 3);
    expect(result.metadata.spokenTags).toEqual({
      checked: true,
      removedSeconds: 1.3,
      spans: 1,
    });
    expect(result.metadata.chunks?.[0]?.spokenTags).toEqual(
      result.metadata.spokenTags
    );
  });

  it("makes no transcription call when the text has no tags", async () => {
    const provider = transcriber(HEARD);
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(1)), modelId: "m" },
      voice: "v",
      text: "No tags here.",
      spokenTagCheck: provider,
    });

    expect(provider.transcribe).not.toHaveBeenCalled();
    expect(result.metadata.spokenTags).toEqual({
      checked: false,
      removedSeconds: 0,
      spans: 0,
    });
  });

  it("keeps the original audio and records the failure when transcription fails", async () => {
    const provider: TranscriptionProvider = {
      transcribe: vi.fn(() => Promise.reject(new Error("scribe down"))),
    };
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
      voice: "v",
      text: TEXT,
      spokenTagCheck: provider,
    });

    expect(
      await decodedSeconds(result.audio.uint8Array, result.audio.mediaType)
    ).toBeCloseTo(8, 3);
    expect(result.metadata.spokenTags).toEqual({
      checked: false,
      failed: "scribe down",
      removedSeconds: 0,
      spans: 0,
    });
  });

  it("rethrows when the call is aborted", async () => {
    const controller = new AbortController();
    const provider: TranscriptionProvider = {
      transcribe: vi.fn(() => {
        controller.abort();
        return Promise.reject(new Error("aborted"));
      }),
    };

    await expect(
      generateSpeech({
        model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
        voice: "v",
        text: TEXT,
        abortSignal: controller.signal,
        spokenTagCheck: provider,
      })
    ).rejects.toThrow();
  });
});

describe("generateConversation spokenTagCheck", () => {
  it("checks a native dialogue once, against every turn's tags, before splitting turns", async () => {
    const dialogue = constantPcm(3);
    const provider: SpeechProvider = {
      ...taggedProvider(dialogue),
      models: [
        {
          id: "m",
          releaseDate: "2025-01-01",
          languages: ["en"],
          features: ["audio-tags", "timestamps"],
        },
      ],
      dialogueCapabilities: () => ({ maxVoices: 2 }),
      generateDialogue: vi.fn(() =>
        Promise.resolve({
          audio: new Uint8Array(dialogue.slice().buffer),
          mediaType: `audio/pcm;rate=${RATE}`,
          timestamps: heard(["Hello", 0.2, 0.8], ["Hi", 2.2, 2.6]),
        })
      ),
    };
    const stt = transcriber(
      heard(["Hello", 0.2, 0.8], ["laughs", 1.2, 1.6], ["Hi", 2.2, 2.6])
    );

    const result = await generateConversation({
      model: { provider, modelId: "m" },
      turns: [
        { voice: "a", text: "Hello" },
        { voice: "b", text: "[laughs] Hi" },
      ],
      timestamps: true,
      spokenTagCheck: stt,
    });

    expect(stt.transcribe).toHaveBeenCalledOnce();
    expect(result.metadata.path).toBe("native");
    expect(result.metadata.spokenTags).toMatchObject({
      checked: true,
      spans: 1,
    });
    expect(result.metadata.spokenTags?.removedSeconds).toBeCloseTo(0.9, 3);
    // Native timings after the cut move back by its length.
    expect(result.timestamps.at(-1)?.start).toBeCloseTo(1.3, 3);
  });
});

describe("createElevenLabs().transcription()", () => {
  it("posts to Scribe v2 without audio events and keeps only timed words", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          words: [
            { text: "Hi", start: 0, end: 0.2, type: "word" },
            { text: " ", start: 0.2, end: 0.3, type: "spacing" },
            { text: "(laughs)", start: 0.3, end: 0.6, type: "audio_event" },
            { text: " ", start: 0.6, end: 0.6, type: "word" },
            { text: "zero", start: 0.7, end: 0.7, type: "word" },
            { text: "there", start: 0.8, end: 1.1, type: "word" },
          ],
        }),
        { status: 200 }
      )
    );
    const words = await createElevenLabs({ apiKey: "k", fetch: fetchFn })
      .transcription()
      .transcribe({ audio: new Uint8Array([1, 2]), mediaType: "audio/wav" });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/speech-to-text");
    const form = init.body as FormData;
    expect(form.get("model_id")).toBe("scribe_v2");
    expect(form.get("tag_audio_events")).toBe("false");
    expect(words).toEqual([
      { text: "Hi", start: 0, end: 0.2 },
      { text: "there", start: 0.8, end: 1.1 },
    ]);
  });
});

function listeningAligner(words: readonly WordTimestamp[]) {
  return {
    align: vi.fn(({ text }: { text: string }) =>
      Promise.resolve(
        text.split(" ").map((word, i) => ({
          text: word,
          start: i * 0.5,
          end: i * 0.5 + 0.4,
        }))
      )
    ),
    transcribe: vi.fn(() => Promise.resolve(words)),
  };
}

describe("automatic spoken-tag check", () => {
  it("runs through a timestampProvider that can transcribe, and reuses its timings instead of aligning", async () => {
    const aligner = listeningAligner(HEARD);
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
      voice: "v",
      text: TEXT,
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(aligner.transcribe).toHaveBeenCalledOnce();
    expect(aligner.align).not.toHaveBeenCalled();
    expect(result.metadata.spokenTags).toMatchObject({
      checked: true,
      spans: 1,
    });
    expect(result.metadata.timestampsSource).toBe("aligned");
    // "In" was heard at 3.4s; the 1.3s cut before it moves it to 2.1s.
    expect(result.timestamps.find((w) => w.text === "In")?.start).toBeCloseTo(
      2.1,
      3
    );
  });

  it("falls back to forced alignment when the transcription doesn't spell the script", async () => {
    const aligner = listeningAligner(
      HEARD.flatMap((word) =>
        word.text === "1962,"
          ? heard(["nineteen", 3.6, 4], ["sixty-two,", 4, 4.4])
          : [word]
      )
    );
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
      voice: "v",
      text: TEXT,
      timestamps: true,
      timestampProvider: aligner,
    });

    expect(aligner.transcribe).toHaveBeenCalledOnce();
    expect(aligner.align).toHaveBeenCalledOnce();
    expect(result.metadata.spokenTags?.spans).toBe(1);
  });

  it("reports when there is nothing to listen with, and leaves the audio as the provider returned it", async () => {
    const provider = taggedProvider(constantPcm(1));
    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      voice: "v",
      text: TEXT,
    });

    expect(result.metadata.spokenTags).toMatchObject({ checked: false });
    expect(result.metadata.spokenTags?.failed).toContain(
      "no transcription provider"
    );
    expect(result.audio.mediaType).toBe(`audio/pcm;rate=${RATE}`);
  });

  it("stays off with spokenTagCheck: false", async () => {
    const aligner = listeningAligner(HEARD);
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
      voice: "v",
      text: TEXT,
      timestamps: true,
      timestampProvider: aligner,
      spokenTagCheck: false,
    });

    expect(aligner.transcribe).not.toHaveBeenCalled();
    expect(aligner.align).toHaveBeenCalledOnce();
    expect(result.metadata.spokenTags).toBeUndefined();
  });

  it("uses an ElevenLabs model's own Scribe with no configuration", async () => {
    const fetchFn = vi.fn((url: string) => {
      if (url.includes("/v1/speech-to-text")) {
        return Promise.resolve(
          Response.json({
            words: HEARD.map((w) => ({ ...w, type: "word" })),
          })
        );
      }
      const rate = Number(url.match(OUTPUT_FORMAT)?.[1] ?? 24_000);
      const pcm = new Int16Array(rate * 8).fill(1000);
      return Promise.resolve(new Response(pcm.buffer));
    });
    const elevenlabs = createElevenLabs({ apiKey: "k", fetch: fetchFn });

    const result = await generateSpeech({
      model: elevenlabs("eleven_v3"),
      voice: "v",
      text: TEXT,
    });

    expect(
      fetchFn.mock.calls.filter(([url]) => url.includes("/v1/speech-to-text"))
    ).toHaveLength(1);
    expect(result.metadata.spokenTags).toMatchObject({
      checked: true,
      spans: 1,
    });
  });
});

describe("spoken-tag check regressions", () => {
  it("never asks for a PCM mode when there's nothing to check", async () => {
    const provider: SpeechProvider = {
      ...taggedProvider(constantPcm(1)),
      getStitchOptions: () => {
        throw new Error("no PCM at 44100 Hz");
      },
      resolveOutputFormat: () => ({
        providerOptions: {},
        expectedMediaType: "audio/mpeg",
      }),
      generate: vi.fn(() =>
        Promise.resolve({
          audio: new Uint8Array([1, 2, 3]),
          mediaType: "audio/mpeg",
        })
      ),
    };

    const untagged = await generateSpeech({
      model: { provider, modelId: "m" },
      voice: "v",
      text: "No tags here.",
      output: { format: "mp3", sampleRate: 44_100 },
    });
    expect(untagged.audio.mediaType).toBe("audio/mpeg");

    const tagged = await generateSpeech({
      model: { provider, modelId: "m" },
      voice: "v",
      text: TEXT,
      spokenTagCheck: transcriber(HEARD),
      output: { format: "mp3", sampleRate: 44_100 },
    });
    expect(tagged.audio.mediaType).toBe("audio/mpeg");
    expect(tagged.metadata.spokenTags?.failed).toContain(
      "no decodable PCM/WAV mode"
    );
  });

  it("returns the provider's audio when a checked single chunk can't be decoded", async () => {
    const provider: SpeechProvider = {
      ...taggedProvider(constantPcm(1)),
      getStitchOptions: () => ({
        providerOptions: {},
        mediaType: "audio/wav",
      }),
      generate: vi.fn(() =>
        Promise.resolve({
          audio: new Uint8Array([1, 2, 3, 4]),
          mediaType: "audio/wav",
        })
      ),
    };
    const stt = transcriber(HEARD);

    const result = await generateSpeech({
      model: { provider, modelId: "m" },
      voice: "v",
      text: TEXT,
      spokenTagCheck: stt,
    });

    expect(stt.transcribe).not.toHaveBeenCalled();
    expect([...result.audio.uint8Array]).toEqual([1, 2, 3, 4]);
    expect(result.metadata.spokenTags?.checked).toBe(false);
    expect(result.metadata.spokenTags?.failed).toBeDefined();
    expect(result.metadata.chunks).toBeUndefined();
  });

  it("ignores maxConcurrency on a single checked chunk, as on any unchunked request", async () => {
    const result = await generateSpeech({
      model: { provider: taggedProvider(constantPcm(8)), modelId: "m" },
      voice: "v",
      text: TEXT,
      maxConcurrency: 0,
      spokenTagCheck: transcriber(HEARD),
    });

    expect(result.metadata.spokenTags?.spans).toBe(1);
  });
});
