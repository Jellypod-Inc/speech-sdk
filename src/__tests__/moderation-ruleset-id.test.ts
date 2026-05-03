import { describe, expect, it, vi } from "vitest";
import { ModerationRulesetIdRequiresGatewayError } from "../errors.js";
import { generateConversation } from "../generate-conversation.js";
import { generateSpeech } from "../generate-speech.js";
import { createSpeechGateway } from "../providers/gateway/index.js";
import { createOpenAI } from "../providers/openai/index.js";
import type { SpeechProvider } from "../speech-provider.js";
import { streamSpeech } from "../stream-speech.js";

const RULESET_ID = "11111111-1111-1111-1111-111111111111";

function mockFetchAudio(body = new Uint8Array([1, 2, 3])) {
  return vi.fn().mockResolvedValue(
    new Response(body, {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    })
  );
}

describe("moderationRulesetId — gateway path", () => {
  it("forwards as moderation_ruleset_id (snake_case) on /audio/speech", async () => {
    const fetchSpy = mockFetchAudio();
    const gw = createSpeechGateway({ apiKey: "gw-key", fetch: fetchSpy });

    await generateSpeech({
      model: gw("openai/tts-1"),
      voice: "alloy",
      text: "Hello",
      moderationRulesetId: RULESET_ID,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.moderation_ruleset_id).toBe(RULESET_ID);
    expect(body.moderationRulesetId).toBeUndefined();
  });

  it("forwards on streamSpeech", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response(new ReadableStream<Uint8Array>(), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      })
    );
    const gw = createSpeechGateway({ apiKey: "gw-key", fetch: fetchSpy });

    await streamSpeech({
      model: gw("openai/tts-1"),
      voice: "alloy",
      text: "Hi",
      moderationRulesetId: RULESET_ID,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.moderation_ruleset_id).toBe(RULESET_ID);
  });

  it("forwards on /audio/conversation", async () => {
    const fetchSpy = mockFetchAudio();
    const gw = createSpeechGateway({ apiKey: "gw-key", fetch: fetchSpy });

    await generateConversation({
      model: gw("openai/gpt-4o-mini-tts"),
      turns: [
        { voice: "alloy", text: "Hi." },
        { voice: "nova", text: "Hello!" },
      ],
      moderationRulesetId: RULESET_ID,
    });

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body as string);
    expect(body.moderation_ruleset_id).toBe(RULESET_ID);
  });
});

describe("moderationRulesetId — non-gateway paths reject", () => {
  it("throws on generateSpeech with a direct provider", async () => {
    const direct = createOpenAI({ apiKey: "openai-key" });
    await expect(
      generateSpeech({
        model: direct("tts-1"),
        voice: "alloy",
        text: "Hello",
        moderationRulesetId: RULESET_ID,
      })
    ).rejects.toBeInstanceOf(ModerationRulesetIdRequiresGatewayError);
  });

  it("throws on streamSpeech with a direct provider", async () => {
    const direct = createOpenAI({ apiKey: "openai-key" });
    await expect(
      streamSpeech({
        model: direct("tts-1"),
        voice: "alloy",
        text: "Hello",
        moderationRulesetId: RULESET_ID,
      })
    ).rejects.toBeInstanceOf(ModerationRulesetIdRequiresGatewayError);
  });

  it("throws on generateConversation when dispatch picks a non-gateway path", async () => {
    const provider: SpeechProvider = {
      id: "native",
      defaultModel: "m",
      models: [],
      generate: vi.fn(),
      generateDialogue: vi.fn().mockResolvedValue({
        audio: new Uint8Array([1, 2, 3]),
        mediaType: "audio/mpeg",
      }),
      dialogueCapabilities: () => ({ minVoices: 1, maxVoices: 10 }),
    };

    await expect(
      generateConversation({
        model: { provider, modelId: "m" },
        turns: [
          { voice: "a", text: "Hi." },
          { voice: "b", text: "Hello." },
        ],
        moderationRulesetId: RULESET_ID,
      })
    ).rejects.toBeInstanceOf(ModerationRulesetIdRequiresGatewayError);
    expect(provider.generateDialogue).not.toHaveBeenCalled();
  });
});
