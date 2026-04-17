import pLimit from "p-limit";
import { generateSpeech } from "../generate-speech.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import { concatPcmToWav, decodeToPcm16 } from "./pcm-concat.js";
import type { ConversationTurn } from "./types.js";

export interface StitchInput<V extends Voice = Voice> {
  readonly abortSignal?: AbortSignal;
  readonly apiKey?: string;
  readonly gapMs: number;
  readonly headers?: Record<string, string>;
  readonly maxConcurrency: number;
  readonly maxRetries: number;
  readonly resolvedPerTurn: readonly ResolvedModel<V>[];
  readonly stitchOptionsPerTurn: readonly {
    providerOptions: Record<string, unknown>;
    mediaType: string;
  }[];
  readonly topLevelProviderOptions?: Record<string, unknown>;
  readonly turns: readonly ConversationTurn<V>[];
}

export interface StitchOutput {
  readonly audio: Uint8Array;
  readonly mediaType: string;
  readonly metadata: {
    readonly inputChars: number;
    readonly latencyMs: number;
    readonly audioDurationMs?: number;
  };
  readonly providerMetadataPerTurn: readonly (
    | Record<string, unknown>
    | undefined
  )[];
  readonly warnings: readonly string[];
}

const TARGET_SAMPLE_RATE = 24_000;

export async function runStitch<V extends Voice>(
  input: StitchInput<V>
): Promise<StitchOutput> {
  const start = performance.now();
  const limit = pLimit(input.maxConcurrency);

  const tasks = input.turns.map((turn, i) =>
    limit(async () => {
      const resolved = input.resolvedPerTurn[i];
      const stitchOpts = input.stitchOptionsPerTurn[i];
      const mergedProviderOptions = {
        ...input.topLevelProviderOptions,
        ...turn.providerOptions,
        ...stitchOpts.providerOptions,
      };
      const result = await generateSpeech({
        model: resolved,
        text: turn.text,
        voice: turn.voice,
        apiKey: input.apiKey,
        providerOptions: mergedProviderOptions,
        maxRetries: input.maxRetries,
        abortSignal: input.abortSignal,
        headers: input.headers,
      });
      const segment = decodeToPcm16(
        result.audio.uint8Array,
        result.audio.mediaType
      );
      return { result, segment };
    })
  );

  const perTurn = await Promise.all(tasks);

  const audio = await concatPcmToWav(
    perTurn.map((p) => p.segment),
    { gapMs: input.gapMs, targetSampleRate: TARGET_SAMPLE_RATE }
  );

  const totalSamples =
    perTurn.reduce(
      (n, p) =>
        n +
        Math.round(
          (p.segment.pcm.length / p.segment.sampleRate) * TARGET_SAMPLE_RATE
        ),
      0
    ) +
    (perTurn.length - 1) *
      Math.round((input.gapMs / 1000) * TARGET_SAMPLE_RATE);
  const audioDurationMs = Math.round(
    (totalSamples / TARGET_SAMPLE_RATE) * 1000
  );

  const warnings = perTurn.flatMap((p) => p.result.warnings ?? []);
  const providerMetadataPerTurn = perTurn.map((p) => p.result.providerMetadata);

  return {
    audio,
    mediaType: "audio/wav",
    metadata: {
      inputChars: input.turns.reduce((n, t) => n + t.text.length, 0),
      latencyMs: Math.round(performance.now() - start),
      audioDurationMs,
    },
    providerMetadataPerTurn,
    warnings,
  };
}
