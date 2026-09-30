export const GOOGLE_PROVIDER_ID = "google" as const;

export const GOOGLE_DEFAULT_MODEL = "gemini-3.8-flash-lite-tts";

export const GEMINI_3_8_MODELS: ReadonlySet<string> = new Set([
  "gemini-3.8-flash-tts",
  "gemini-3.8-flash-lite-tts",
]);

export const GOOGLE_IPA_PRONUNCIATION_MODELS: ReadonlySet<string> =
  GEMINI_3_8_MODELS;
