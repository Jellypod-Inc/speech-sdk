import pRetry from "p-retry";
import { computeAudioDuration } from "./audio-duration.js";
import { detectAudioTags, stripAudioTags } from "./audio-tags.js";
import { deriveTimestampsViaSTT } from "./derive-timestamps.js";
import {
  ApiError,
  NoSpeechGeneratedError,
  VolumeAdjustmentUnsupportedError,
} from "./errors.js";
import type { SpeechMetadata } from "./metadata.js";
import { resolveModel } from "./resolve-provider.js";
import {
  modelDeclaresNativeTimestamps,
  type ResolvedModel,
  type Voice,
} from "./speech-provider.js";
import type { SpeechResult } from "./speech-result.js";
import { DefaultGeneratedAudioFile } from "./speech-result.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type { TimestampMode, WordTimestamp } from "./timestamps.js";

export async function generateSpeech<V extends Voice = Voice>(options: {
  model: string | ResolvedModel<V>;
  text: string;
  voice: V;
  apiKey?: string;
  providerOptions?: Record<string, unknown>;
  maxRetries?: number;
  abortSignal?: AbortSignal;
  headers?: Record<string, string>;
  /**
   * RMS-normalize the returned audio to this dBFS level. Must be ≤ 0.
   * When set, generateSpeech requests the provider's decodable PCM/WAV
   * output mode (via `getStitchOptions`), normalizes the samples to the
   * target loudness, and re-encodes the result as 16-bit mono WAV — so
   * the response `mediaType` will be `audio/wav` regardless of the
   * provider's native default. Throws `VolumeAdjustmentUnsupportedError`
   * if the provider doesn't expose a decodable output mode.
   */
  volumeDbfs?: number;
  /**
   * Controls whether the returned `SpeechResult` includes word-level
   * timestamps. Default `"auto"` — return natively when the TTS provider
   * supplies alignment, otherwise omit. `"on"` forces word timestamps
   * (falling back to STT round-trip when necessary). `"off"` suppresses
   * them even for providers that would return them free.
   */
  timestamps?: TimestampMode;
  /**
   * Override the STT provider used for the derived-timestamps path. Accepts a
   * `"provider/model"` string (e.g. `"openai/whisper-1"`, `"deepgram/nova-3"`)
   * or a `ResolvedSTTModel` for custom providers. Only consulted when
   * timestamps are requested AND the TTS provider can't supply them natively.
   */
  timestampProvider?: string | ResolvedSTTModel;
  /**
   * API key for the STT provider used in the derived-timestamps path. Falls
   * back to the env var of the chosen STT provider (e.g. `OPENAI_API_KEY`).
   */
  timestampApiKey?: string;
}): Promise<SpeechResult> {
  const {
    model,
    voice,
    abortSignal,
    headers,
    volumeDbfs,
    timestamps: timestampMode = "auto",
    timestampProvider,
    timestampApiKey,
  } = options;
  const maxRetries = options.maxRetries ?? 2;

  const resolved = resolveModel(model, { apiKey: options.apiKey });
  const modelIdentifier = `${resolved.provider.id}/${resolved.modelId}`;

  let providerOptions = options.providerOptions;

  if (volumeDbfs != null) {
    const stitchOpts = resolved.provider.getStitchOptions?.(resolved.modelId);
    if (!stitchOpts) {
      throw new VolumeAdjustmentUnsupportedError(modelIdentifier);
    }
    // Stitch-mode options are applied last so they win over user-supplied
    // providerOptions — otherwise a caller could silently break the decoder
    // by e.g. passing `response_format: "mp3"` alongside `volumeDbfs`.
    providerOptions = {
      ...options.providerOptions,
      ...stitchOpts.providerOptions,
    };
  }

  const { text: processedText, warnings } = preprocessText(
    resolved,
    options.text,
    modelIdentifier
  );

  if (processedText.trim().length === 0) {
    throw new NoSpeechGeneratedError(
      warnings.length > 0
        ? `Text is empty after removing unsupported audio tags for ${modelIdentifier}.`
        : "Text must not be empty."
    );
  }

  const hasNativeTimestamps = modelDeclaresNativeTimestamps(resolved);

  // For "on" we still ask the provider natively first — if it has native
  // alignment, we skip the STT round-trip.
  const shouldRequestNative =
    (timestampMode === "on" || timestampMode === "auto") && hasNativeTimestamps;

  const startTime = performance.now();

  const result = await pRetry(
    () =>
      resolved.provider.generate({
        modelId: resolved.modelId,
        text: processedText,
        voice,
        providerOptions,
        abortSignal,
        headers,
        includeTimestamps: shouldRequestNative,
      }),
    {
      retries: maxRetries,
      signal: abortSignal,
      shouldRetry: ({ error }) => {
        if (error instanceof ApiError && error.statusCode < 500) {
          return false;
        }
        return true;
      },
    }
  );

  const latencyMs = Math.round(performance.now() - startTime);

  const audioData = result.audio;

  if (audioData.length === 0) {
    throw new NoSpeechGeneratedError();
  }

  let outputBytes: Uint8Array | string = audioData;
  let outputMediaType = result.mediaType;

  if (volumeDbfs != null) {
    const { adjustVolume } = await import("./volume-adjust.js");
    outputBytes = await adjustVolume({
      audio: audioData,
      mediaType: result.mediaType,
      volumeDbfs,
    });
    outputMediaType = "audio/wav";
  }

  const audio = new DefaultGeneratedAudioFile({
    data: outputBytes,
    mediaType: outputMediaType,
  });

  const audioDurationMs =
    (await computeAudioDuration(audio.uint8Array, outputMediaType)) ??
    result.audioDurationMs;

  let timestamps: readonly WordTimestamp[] | undefined;
  if (timestampMode !== "off") {
    if (result.timestamps && result.timestamps.length > 0) {
      timestamps = result.timestamps;
    } else if (timestampMode === "on") {
      timestamps = await deriveTimestampsViaSTT({
        ttsModel: modelIdentifier,
        audio: audio.uint8Array,
        mediaType: outputMediaType,
        timestampProvider,
        timestampApiKey,
        abortSignal,
      });
    }
  }

  const metadata: SpeechMetadata = {
    latencyMs,
    inputChars: processedText.length,
    provider: resolved.provider.id,
    model: resolved.modelId,
    ...(audioDurationMs != null && { audioDurationMs }),
  };

  return {
    audio,
    metadata,
    providerMetadata: result.providerMetadata,
    warnings: warnings.length > 0 ? warnings : undefined,
    timestamps,
  };
}

function preprocessText(
  resolved: ResolvedModel,
  rawText: string,
  modelIdentifier: string
): { text: string; warnings: string[] } {
  if (resolved.provider.processAudioTags) {
    return resolved.provider.processAudioTags(rawText, resolved.modelId);
  }
  const tags = detectAudioTags(rawText);
  if (tags.length > 0) {
    return stripAudioTags(rawText, modelIdentifier);
  }
  return { text: rawText, warnings: [] };
}
