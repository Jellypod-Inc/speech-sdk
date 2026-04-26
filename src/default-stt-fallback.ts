import type { ResolvedSTTModel } from "./speech-to-text-provider.js";

let cached: ResolvedSTTModel | undefined;

// Dynamic import keeps the OpenAI provider module out of bundles for users
// who never trigger the default (native-timestamps providers, explicit
// fallbackSTT overrides, gateway path). Matches the lazy pattern used by
// volume-adjust.ts in generate-speech.ts.
export async function getDefaultSTTFallback(): Promise<ResolvedSTTModel> {
  if (cached) {
    return cached;
  }
  const { createOpenAI } = await import("./providers/openai/index.js");
  cached = createOpenAI().stt("whisper-1");
  return cached;
}
