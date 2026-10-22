export const generateConversationExample = `import { generateConversation } from "@speech-sdk/core";

const result = await generateConversation({
  turns: [
    {
      model: "elevenlabs/eleven_v3",
      voice: "EXAVITQu4vr4xnSDxMaL",
      text: "Hello from the SDK.",
    },
    {
      model: "google/gemini-3.1-flash-tts-preview",
      voice: "Kore",
      text: "One call. Multiple voices. Auto-leveled.",
    },
  ],
});

result.audio.uint8Array; // Uint8Array
result.audio.mediaType;  // "audio/mpeg"`;
