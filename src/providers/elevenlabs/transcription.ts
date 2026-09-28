import { z } from "zod";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type { WordTimestamp } from "../../timestamps.js";
import type { TranscriptionProvider } from "../../transcription-provider.js";
import { speechFileForm } from "./speech-file-form.js";

const SCRIBE_MODEL_ID = "scribe_v2";

const scribeWordSchema = z.object({
  end: z.number().nullish(),
  start: z.number().nullish(),
  text: z.string(),
  type: z.string().nullish(),
});

const scribeResponseSchema = z.object({
  words: z.array(scribeWordSchema).default([]),
});

function timedScribeWords(
  words: readonly z.infer<typeof scribeWordSchema>[]
): WordTimestamp[] {
  const timed: WordTimestamp[] = [];
  for (const word of words) {
    const text = word.text.trim();
    const { start, end } = word;
    if (
      word.type === "word" &&
      text.length > 0 &&
      start != null &&
      end != null &&
      Number.isFinite(start) &&
      Number.isFinite(end) &&
      start >= 0 &&
      end > start
    ) {
      timed.push({ text, start, end });
    }
  }
  return timed;
}

export class ElevenLabsTranscriptionProvider implements TranscriptionProvider {
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

  async transcribe(options: {
    abortSignal?: AbortSignal;
    audio: Uint8Array;
    mediaType: string;
  }): Promise<WordTimestamp[]> {
    const form = speechFileForm(options.audio, options.mediaType);
    form.append("model_id", SCRIBE_MODEL_ID);
    form.append("tag_audio_events", "false");

    const response = await this.fetchFn(`${this.baseURL}/v1/speech-to-text`, {
      method: "POST",
      headers: {
        "xi-api-key": resolveApiKey(
          this.apiKey,
          "ELEVENLABS_API_KEY",
          "ElevenLabs"
        ),
        "X-User-Agent": SDK_USER_AGENT,
      },
      body: form,
      signal: options.abortSignal,
    });

    await handleErrorResponse(response, {
      provider: "elevenlabs",
      model: SCRIBE_MODEL_ID,
      stage: "transcription",
    });

    const payload = scribeResponseSchema.parse(await response.json());
    return timedScribeWords(payload.words);
  }
}
