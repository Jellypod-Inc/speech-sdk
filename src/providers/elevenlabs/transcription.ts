import { z } from "zod";
import {
  handleErrorResponse,
  resolveApiKey,
  SDK_USER_AGENT,
} from "../../provider-utils.js";
import type { WordTimestamp } from "../../timestamps.js";
import type { TranscriptionProvider } from "../../transcription-provider.js";
import type { VercelAIGatewayClient } from "../../vercel-ai-gateway-client.js";
import { speechFileForm } from "./speech-file-form.js";

const SCRIBE_MODEL_ID = "scribe_v2";
const GATEWAY_SCRIBE_MODEL_ID = "elevenlabs/scribe-v2";

const scribeWordSchema = z.object({
  end: z.number().nullish(),
  start: z.number().nullish(),
  text: z.string(),
  type: z.string().nullish(),
});

const scribeResponseSchema = z.object({
  words: z.array(scribeWordSchema).default([]),
});

const gatewayScribeMetadataSchema = z.object({
  elevenlabs: scribeResponseSchema,
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
  private readonly client: VercelAIGatewayClient | undefined;

  constructor(config: {
    apiKey?: string;
    baseURL?: string;
    client?: VercelAIGatewayClient;
    fetch?: typeof globalThis.fetch;
  }) {
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.elevenlabs.io";
    this.fetchFn = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.client = config.client;
  }

  async transcribe(options: {
    abortSignal?: AbortSignal;
    audio: Uint8Array;
    mediaType: string;
  }): Promise<WordTimestamp[]> {
    if (this.client) {
      const result = await this.client.transcription({
        provider: "elevenlabs",
        model: GATEWAY_SCRIBE_MODEL_ID,
        audio: options.audio,
        mediaType: options.mediaType,
        providerOptions: { elevenlabs: { tagAudioEvents: false } },
        abortSignal: options.abortSignal,
      });
      const metadata = gatewayScribeMetadataSchema.parse(
        result.providerMetadata
      );
      return timedScribeWords(metadata.elevenlabs.words);
    }
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
