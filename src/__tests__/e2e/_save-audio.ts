import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { expect } from "vitest";
import { timestampsToCaptions } from "../../captions.js";
import { generateConversation as _generateConversation } from "../../generate-conversation.js";
import { generateSpeech as _generateSpeech } from "../../generate-speech.js";
import type { WordTimestamp } from "../../timestamps.js";
import { collectStream } from "./_collect-stream.js";

function extFor(mediaType: string): string {
  if (mediaType.includes("wav")) {
    return "wav";
  }
  if (mediaType.includes("mpeg") || mediaType.includes("mp3")) {
    return "mp3";
  }
  if (mediaType.includes("ogg")) {
    return "ogg";
  }
  if (mediaType.includes("flac")) {
    return "flac";
  }
  if (mediaType.includes("opus")) {
    return "opus";
  }
  if (mediaType.includes("pcm")) {
    return "pcm";
  }
  return "bin";
}

const NON_SLUG_CHARS = /[^a-zA-Z0-9._-]+/g;
const LEADING_OR_TRAILING_UNDERSCORES = /^_+|_+$/g;
const E2E_TEST_SUFFIX = /\.e2e\.test\.(ts|tsx|js|mjs)$/;

function slugify(name: string): string {
  return name
    .replace(NON_SLUG_CHARS, "_")
    .replace(LEADING_OR_TRAILING_UNDERSCORES, "");
}

function resolveOutputDir(): string | null {
  const dir = process.env.SPEECH_SDK_E2E_OUTPUT_DIR;
  if (!dir) {
    return null;
  }
  return dir.startsWith("~") ? join(process.env.HOME ?? "", dir.slice(1)) : dir;
}

function currentTestContext(): {
  currentTestName: string | undefined;
  testPath: string | undefined;
} {
  // biome-ignore lint/suspicious/noMisplacedAssertion: reading vitest state, not asserting
  const state = expect.getState();
  return {
    currentTestName: state.currentTestName,
    testPath: state.testPath,
  };
}

function providerBucket(testPath: string | undefined): string {
  if (!testPath) {
    return "unknown";
  }
  const base = basename(testPath).replace(E2E_TEST_SUFFIX, "");
  return slugify(base) || "unknown";
}

// Counter so multiple saves in one test don't overwrite each other.
const callCounts = new Map<string, number>();

function nextStem(bucket: string, slug: string): string {
  const key = `${bucket}/${slug}`;
  const n = (callCounts.get(key) ?? 0) + 1;
  callCounts.set(key, n);
  return n === 1 ? slug : `${slug}-${n}`;
}

async function writeAndLog(file: string, data: string | Uint8Array) {
  await writeFile(file, data);
  console.log(`[e2e-save] wrote ${file}`);
}

// No-op unless SPEECH_SDK_E2E_OUTPUT_DIR is set.
export async function maybeSaveAudio(
  name: string,
  audio: { uint8Array: Uint8Array; mediaType: string }
): Promise<void> {
  await maybeSaveResult(name, audio);
}

export async function maybeSaveResult(
  name: string,
  audio: { uint8Array: Uint8Array; mediaType: string },
  timestamps?: readonly WordTimestamp[]
): Promise<void> {
  const dir = resolveOutputDir();
  if (!dir) {
    return;
  }
  const { testPath } = currentTestContext();
  const bucket = providerBucket(testPath);
  const bucketDir = join(dir, bucket);
  await mkdir(bucketDir, { recursive: true });
  const stem = nextStem(bucket, slugify(name));

  await writeAndLog(
    join(bucketDir, `${stem}.${extFor(audio.mediaType)}`),
    audio.uint8Array
  );

  if (timestamps && timestamps.length > 0) {
    await writeAndLog(
      join(bucketDir, `${stem}.timestamps.json`),
      `${JSON.stringify(timestamps, null, 2)}\n`
    );
    await writeAndLog(
      join(bucketDir, `${stem}.srt`),
      timestampsToCaptions(timestamps)
    );
    await writeAndLog(
      join(bucketDir, `${stem}.vtt`),
      timestampsToCaptions(timestamps, { format: "vtt" })
    );
  }
}

function currentTestSlug(): string {
  const { currentTestName } = currentTestContext();
  return slugify(currentTestName ?? "unnamed") || "unnamed";
}

export const generateSpeech: typeof _generateSpeech = (async (
  options: Parameters<typeof _generateSpeech>[0]
) => {
  const result = await _generateSpeech(options);
  await maybeSaveResult(currentTestSlug(), result.audio, result.timestamps);
  return result;
}) as typeof _generateSpeech;

export const generateConversation: typeof _generateConversation = (async (
  options: Parameters<typeof _generateConversation>[0]
) => {
  const result = await _generateConversation(options);
  await maybeSaveResult(currentTestSlug(), result.audio, result.timestamps);
  return result;
}) as typeof _generateConversation;

export async function collectStreamAndSave(result: {
  audio: ReadableStream<Uint8Array>;
  mediaType: string;
}): Promise<Uint8Array> {
  const bytes = await collectStream(result.audio);
  await maybeSaveAudio(currentTestSlug(), {
    uint8Array: bytes,
    mediaType: result.mediaType,
  });
  return bytes;
}
