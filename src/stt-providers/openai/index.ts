// Transient re-export shim. createOpenAISTT and OpenAISpeechToTextProviderConfig
// are deleted in a follow-up task; this file is removed entirely once the last
// consumer migrates.

import {
  OpenAISpeechToTextProvider as _OpenAISpeechToTextProvider,
  type OpenAISpeechProviderConfig,
} from "../../providers/openai/index.js";
import type { ResolvedSTTModel } from "../../speech-to-text-provider.js";

// biome-ignore lint/performance/noBarrelFile: transient shim — removed in a follow-up task once all consumers migrate
export { OpenAISpeechToTextProvider } from "../../providers/openai/index.js";

export type OpenAISpeechToTextProviderConfig = OpenAISpeechProviderConfig;

export function createOpenAISTT(config: OpenAISpeechToTextProviderConfig = {}) {
  const provider = new _OpenAISpeechToTextProvider(config);
  return function openaiSTT(modelId?: string): ResolvedSTTModel {
    return {
      provider,
      modelId: modelId ?? provider.defaultModel,
    };
  };
}
