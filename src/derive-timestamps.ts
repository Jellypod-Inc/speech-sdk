import {
  MissingApiKeyError,
  TimestampKeyMissingError,
  withProviderErrorStage,
} from "./errors.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import type { WordTimestamp } from "./timestamps.js";

export async function deriveTimestampsViaSTT(args: {
  ttsModel: string;
  audio: Uint8Array;
  mediaType: string;
  text?: string;
  timestampFallback: ResolvedSTTModel;
  abortSignal: AbortSignal | undefined;
}): Promise<readonly WordTimestamp[]> {
  const sttModel = args.timestampFallback;

  try {
    const { timestamps } = await sttModel.provider.transcribe({
      modelId: sttModel.modelId,
      audio: args.audio,
      mediaType: args.mediaType,
      ...(args.text !== undefined && { text: args.text }),
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
    throw withProviderErrorStage(err, "alignment");
  }
}
