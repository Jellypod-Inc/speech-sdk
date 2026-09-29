import { describe, expect, it, vi } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
} from "../conversation/errors.js";
import { StreamingNotSupportedError } from "../errors.js";
import { createGoogle } from "../providers/google/index.js";
import { streamConversation } from "../stream-conversation.js";

const SSE =
  'event: step.delta\ndata: {"event_type":"step.delta","delta":{"type":"audio","mime_type":"audio/l16","data":"AAAAAA=="}}\n\n';

const TURNS = [
  { text: "Did you see the results?", voice: "Kore" },
  {
    text: "[laughs] I did.",
    voice: "Puck",
    instructions: "dry and amused",
  },
] as const;

function googleWith(fetch: typeof globalThis.fetch) {
  return createGoogle({ apiKey: "key", fetch });
}

describe("streamConversation", () => {
  it("streams Gemini 3.8 dialogue with the buffered request body plus stream: true", async () => {
    const fetch = vi.fn((_url: string, init: RequestInit) =>
      Promise.resolve(
        JSON.parse(init.body as string).stream
          ? new Response(SSE)
          : Response.json({ steps: [] })
      )
    );
    const google = googleWith(fetch);

    const result = await streamConversation({
      model: google("gemini-3.8-flash-tts"),
      instructions: "podcast banter",
      turns: TURNS,
    });

    const [url, init] = fetch.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions"
    );
    expect(init.headers).not.toHaveProperty("Api-Revision");
    expect(body).toEqual({
      model: "gemini-3.8-flash-tts",
      input: [
        {
          type: "user_input",
          content: [
            {
              type: "text",
              text: "Did you see the results?",
              annotations: [
                {
                  type: "speech_metadata",
                  speaker: "Speaker1",
                  style: "podcast banter",
                },
              ],
            },
            {
              type: "text",
              text: "<laughs> I did.",
              annotations: [
                {
                  type: "speech_metadata",
                  speaker: "Speaker2",
                  style: "podcast banter; dry and amused",
                },
              ],
            },
          ],
        },
      ],
      response_format: { type: "audio" },
      generation_config: {
        speech_config: {
          mode: "conversational",
          speakers: [
            { speaker: "Speaker1", voice: "Kore" },
            { speaker: "Speaker2", voice: "Puck" },
          ],
        },
      },
      stream: true,
    });
    expect(result.mediaType).toBe("audio/pcm;rate=24000");
    expect((await result.audio.getReader().read()).value).toEqual(
      new Uint8Array(4)
    );

    // The buffered request is the same body without stream: true, so the two can't drift.
    await google("gemini-3.8-flash-tts")
      .provider.generateDialogue?.({
        modelId: "gemini-3.8-flash-tts",
        instructions: "podcast banter",
        turns: TURNS,
      })
      .catch(() => undefined);
    const { stream: _stream, ...streamed } = body;
    expect(JSON.parse(fetch.mock.calls[1][1].body as string)).toEqual(streamed);
  });

  it("throws StreamingNotSupportedError for a model that can't stream dialogue", async () => {
    const fetch = vi.fn();
    await expect(
      streamConversation({
        model: googleWith(fetch)("gemini-2.5-flash-preview-tts"),
        turns: TURNS,
      })
    ).rejects.toBeInstanceOf(StreamingNotSupportedError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a conversation over the dialogue character budget", async () => {
    const fetch = vi.fn();
    await expect(
      streamConversation({
        model: googleWith(fetch)("gemini-3.8-flash-tts"),
        turns: [
          { text: "a ".repeat(2100), voice: "Kore" },
          { text: "b ".repeat(2100), voice: "Puck" },
        ],
      })
    ).rejects.toBeInstanceOf(DialogueConstraintError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects options that need the whole take", async () => {
    const fetch = vi.fn();
    await expect(
      streamConversation({
        model: googleWith(fetch)("gemini-3.8-flash-tts"),
        turns: TURNS,
        ...{ timestamps: true },
      })
    ).rejects.toThrow(ConversationInputError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
