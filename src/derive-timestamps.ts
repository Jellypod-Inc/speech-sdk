import { MissingApiKeyError, TimestampKeyMissingError } from "./errors.js";
import { resolveSTTModel } from "./resolve-stt-provider.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type { WordTimestamp } from "./timestamps.js";

/**
 * Default STT model for the derived-timestamps path when the caller hasn't
 * supplied a `timestampProvider` override. Users who want provider-aware
 * smart routing should set the override explicitly or use the Jellypod
 * Gateway product.
 */
export const DEFAULT_TIMESTAMP_PROVIDER = "openai/whisper-1";

/**
 * Pipes synthesized audio through an STT provider to produce word-level
 * timestamps. Shared between `generateSpeech()` and conversation paths.
 */
export async function deriveTimestampsViaSTT(args: {
  ttsModel: string;
  audio: Uint8Array;
  mediaType: string;
  timestampProvider: string | ResolvedSTTModel | undefined;
  timestampApiKey: string | undefined;
  abortSignal: AbortSignal | undefined;
}): Promise<readonly WordTimestamp[]> {
  const providerSpec = args.timestampProvider ?? DEFAULT_TIMESTAMP_PROVIDER;
  const sttModel = resolveSTTModel(providerSpec, {
    apiKey: args.timestampApiKey,
  });

  try {
    const { timestamps } = await sttModel.provider.transcribe({
      modelId: sttModel.modelId,
      audio: args.audio,
      mediaType: args.mediaType,
      abortSignal: args.abortSignal,
    });
    return timestamps;
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      throw new TimestampKeyMissingError({
        ttsModel: args.ttsModel,
        sttProvider: `${sttModel.provider.id}/${sttModel.modelId}`,
        envVar: err.envVar,
      });
    }
    throw err;
  }
}
