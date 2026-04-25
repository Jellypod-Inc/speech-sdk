import { MissingApiKeyError, TimestampKeyMissingError } from "./errors.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type { WordTimestamp } from "./timestamps.js";

export async function deriveTimestampsViaSTT(args: {
  ttsModel: string;
  audio: Uint8Array;
  mediaType: string;
  timestampFallback: ResolvedSTTModel | undefined;
  abortSignal: AbortSignal | undefined;
}): Promise<readonly WordTimestamp[]> {
  if (!args.timestampFallback) {
    // Callers (resolveTimestamps in generate-speech, conversation path in Task 5)
    // must gate on a configured fallback before calling this function.
    throw new Error(
      `deriveTimestampsViaSTT called without a configured timestampFallback for ${args.ttsModel}. This is a bug.`
    );
  }
  const sttModel = args.timestampFallback;

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
