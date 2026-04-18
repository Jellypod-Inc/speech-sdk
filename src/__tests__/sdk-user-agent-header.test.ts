import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { resolveModel } from "../resolve-provider.js";

// Every built-in provider registered in resolve-provider.ts must appear here.
// The SDK sends `X-User-Agent: jellypod-speech-sdk` so providers can bucket
// usage by integration — new providers should inherit the same behaviour.
const PROVIDERS: Array<{ name: string; modelId: string; voice?: string }> = [
  { name: "openai", modelId: "gpt-4o-mini-tts", voice: "alloy" },
  {
    name: "elevenlabs",
    modelId: "eleven_multilingual_v2",
    voice: "voice-id",
  },
  { name: "deepgram", modelId: "aura-2", voice: "thalia-en" },
  { name: "cartesia", modelId: "sonic-3", voice: "voice-id" },
  { name: "hume", modelId: "octave-2", voice: "voice-name" },
  { name: "inworld", modelId: "inworld-tts-1.5-max", voice: "Ashley" },
  {
    name: "google",
    modelId: "gemini-2.5-flash-preview-tts",
    voice: "Kore",
  },
  { name: "fish-audio", modelId: "s2-pro", voice: "voice-id" },
  { name: "unreal-speech", modelId: "default", voice: "Scarlett" },
  { name: "murf", modelId: "GEN2", voice: "voice-id" },
  { name: "resemble", modelId: "default", voice: "voice-uuid" },
  { name: "fal-ai", modelId: "dia-tts", voice: "voice" },
  { name: "mistral", modelId: "voxtral-mini-tts-2603", voice: "Balthazar" },
  { name: "xai", modelId: "grok-tts", voice: "alloy" },
];

describe("SDK user-agent header", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  for (const { name, modelId, voice } of PROVIDERS) {
    it(`${name} sends X-User-Agent: ${SDK_USER_AGENT}`, async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: new Headers(),
        text: async () => "",
      });
      globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch;

      const { provider } = resolveModel(`${name}/${modelId}`, {
        apiKey: "test-key",
      });

      // Responses intentionally fail — we only need the fetch call to happen.
      await provider.generate({ modelId, text: "hello", voice }).catch(() => {
        /* expected */
      });

      expect(mockFetch).toHaveBeenCalled();
      const init = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = init.headers as Record<string, string>;
      expect(headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    });
  }
});
