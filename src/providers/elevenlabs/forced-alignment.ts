import { z } from "zod";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import { finalizeTimestamps } from "../../timestamp-finalization.js";
import type { TimestampProvider } from "../../timestamp-provider.js";
import type { WordTimestamp } from "../../timestamps.js";
import { alignmentToWordTimestamps } from "./alignment.js";

const LEXICAL_CHARACTER = /[\p{L}\p{N}]/u;

const forcedAlignmentTokenSchema = z.object({
  end: z.number(),
  start: z.number(),
  text: z.string(),
});

const forcedAlignmentResponseSchema = z.object({
  characters: z.array(forcedAlignmentTokenSchema).default([]),
  words: z.array(forcedAlignmentTokenSchema).default([]),
});

function wordTimestamps(
  words: z.infer<typeof forcedAlignmentTokenSchema>[]
): WordTimestamp[] {
  return words
    .filter(({ text }) => LEXICAL_CHARACTER.test(text))
    .map(({ text, start, end }) => ({ text, start, end }));
}

function characterTimestamps(
  characters: z.infer<typeof forcedAlignmentTokenSchema>[]
): WordTimestamp[] {
  return alignmentToWordTimestamps({
    characters: characters.map(({ text }) => text),
    character_start_times_seconds: characters.map(({ start }) => start),
    character_end_times_seconds: characters.map(({ end }) => end),
  });
}

function resolveForcedAlignmentTimestamps(
  payload: z.infer<typeof forcedAlignmentResponseSchema>,
  text: string
): WordTimestamp[] {
  const words = wordTimestamps(payload.words);
  if (words.length === 0) {
    return [];
  }
  const characters = characterTimestamps(payload.characters);

  for (const candidate of [characters, words]) {
    if (finalizeTimestamps({ text, timestamps: candidate }).ok) {
      return candidate;
    }
  }

  return characters.length > 0 ? characters : words;
}

function audioExtension(mediaType: string): string {
  const base = mediaType.split(";")[0]?.toLowerCase();
  switch (base) {
    case "audio/wav":
    case "audio/x-wav":
      return "wav";
    case "audio/flac":
      return "flac";
    case "audio/ogg":
    case "audio/opus":
      return "ogg";
    case "audio/webm":
      return "webm";
    default:
      return "mp3";
  }
}

export class ElevenLabsForcedAlignmentProvider implements TimestampProvider {
  private readonly apiKey: string | undefined;
  private readonly baseURL: string;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: {
    apiKey?: string;
    baseURL?: string;
    fetch?: typeof globalThis.fetch;
  }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.elevenlabs.io";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async align(options: {
    audio: Uint8Array;
    mediaType: string;
    text: string;
    abortSignal?: AbortSignal;
    headers?: Record<string, string>;
  }) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([options.audio.slice()], { type: options.mediaType }),
      `speech.${audioExtension(options.mediaType)}`
    );
    form.append("text", options.text);

    const response = await this.fetchFn(`${this.baseURL}/v1/forced-alignment`, {
      method: "POST",
      headers: {
        "xi-api-key": resolveApiKey(
          this.apiKey,
          "ELEVENLABS_API_KEY",
          "ElevenLabs"
        ),
        "X-User-Agent": SDK_USER_AGENT,
        ...options.headers,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, {
      provider: "elevenlabs",
      model: "forced-alignment",
      stage: "alignment",
    });

    const payload = forcedAlignmentResponseSchema.parse(await response.json());
    return resolveForcedAlignmentTimestamps(payload, options.text);
  }
}
