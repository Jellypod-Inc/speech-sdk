import { MissingApiKeyError, TimestampKeyMissingError } from "./errors.js";
import type { ResolvedSTTModel } from "./speech-to-text-provider.js";
import { OpenAISpeechToTextProvider } from "./stt-providers/openai/index.js";
import type { WordTimestamp } from "./timestamps.js";

function defaultTimestampProvider(): ResolvedSTTModel {
  const provider = new OpenAISpeechToTextProvider();
  return { provider, modelId: provider.defaultModel };
}

export async function deriveTimestampsViaSTT(args: {
  ttsModel: string;
  audio: Uint8Array;
  mediaType: string;
  timestampProvider: ResolvedSTTModel | undefined;
  abortSignal: AbortSignal | undefined;
}): Promise<readonly WordTimestamp[]> {
  const sttModel = args.timestampProvider ?? defaultTimestampProvider();

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
