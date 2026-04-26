import type { ResolvedSTTModel } from "./speech-to-text-provider.js";

let cached: ResolvedSTTModel | undefined;

// Dynamic import keeps the OpenAI provider out of bundles for callers who never trigger the STT fallback.
export async function getDefaultSTTFallback(): Promise<ResolvedSTTModel> {
  if (cached) {
    return cached;
  }
  const { createOpenAI } = await import("./providers/openai/index.js");
  cached = createOpenAI().stt("whisper-1");
  return cached;
}
