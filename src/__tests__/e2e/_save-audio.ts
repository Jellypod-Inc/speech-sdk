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

/**
 * Derives the subdirectory for a given test file. e2e tests are named like
 * `openai.e2e.test.ts` / `conversation-google.e2e.test.ts`; we strip the
 * `.e2e.test.ts` suffix and use that as the per-provider bucket so a full run
 * doesn't dump 100+ files into a single flat directory.
 */
function providerBucket(testPath: string | undefined): string {
  if (!testPath) {
    return "unknown";
  }
  const base = basename(testPath).replace(E2E_TEST_SUFFIX, "");
  return slugify(base) || "unknown";
}

// Counter keyed by `${bucket}/${slug}` so multiple generate/stream calls
// within a single test don't overwrite each other. Vitest isolates modules
// per file, so this resets per test file — collisions are only meaningful
// within the same `it`.
const callCounts = new Map<string, number>();

/**
 * Reserves a filename stem (without extension) for the next save call.
 * First call returns `slug`; subsequent calls return `slug-2`, `slug-3`, etc.
 * A single stem is shared across all sibling outputs from one logical save
 * (audio + timestamps + captions), so they remain paired even across
 * multiple saves within the same test.
 */
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

/**
 * Write a test-generated audio file to `SPEECH_SDK_E2E_OUTPUT_DIR` if the env
 * var is set. No-op otherwise, so normal CI runs don't produce artifacts.
 * Usually you don't need to call this directly — use the `generateSpeech`,
 * `generateConversation`, and `collectStreamAndSave` helpers exported from
 * this module, which autosave using the current test name.
 *
 * Output layout: `$SPEECH_SDK_E2E_OUTPUT_DIR/<provider-file>/<test-slug>.<ext>`.
 * If the same test saves multiple times, subsequent files are suffixed `-2`,
 * `-3`, etc.
 */
export async function maybeSaveAudio(
  name: string,
  audio: { uint8Array: Uint8Array; mediaType: string }
): Promise<void> {
  await maybeSaveResult(name, audio);
}

/**
 * Like {@link maybeSaveAudio}, plus — when `timestamps` is non-empty — also
 * writes the raw alignment JSON and rendered SRT/VTT caption files alongside
 * the audio. All four files share the same stem so they stay paired across
 * multi-call tests. Still a no-op when `SPEECH_SDK_E2E_OUTPUT_DIR` is unset.
 *
 * Output layout (when timestamps present):
 * ```
 * <dir>/<bucket>/<slug>.<audio-ext>
 * <dir>/<bucket>/<slug>.timestamps.json
 * <dir>/<bucket>/<slug>.srt
 * <dir>/<bucket>/<slug>.vtt
 * ```
 */
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

/**
 * Drop-in replacement for `generateSpeech` that autosaves to
 * `SPEECH_SDK_E2E_OUTPUT_DIR` using the current vitest test name. When the
 * result includes word timestamps, also writes paired `.timestamps.json`,
 * `.srt`, and `.vtt` files.
 */
export const generateSpeech: typeof _generateSpeech = (async (
  options: Parameters<typeof _generateSpeech>[0]
) => {
  const result = await _generateSpeech(options);
  await maybeSaveResult(currentTestSlug(), result.audio, result.timestamps);
  return result;
}) as typeof _generateSpeech;

/**
 * Drop-in replacement for `generateConversation` that autosaves to
 * `SPEECH_SDK_E2E_OUTPUT_DIR` using the current vitest test name. When the
 * result includes word timestamps, also writes paired `.timestamps.json`,
 * `.srt`, and `.vtt` files.
 */
export const generateConversation: typeof _generateConversation = (async (
  options: Parameters<typeof _generateConversation>[0]
) => {
  const result = await _generateConversation(options);
  await maybeSaveResult(currentTestSlug(), result.audio, result.timestamps);
  return result;
}) as typeof _generateConversation;

/**
 * Collects a streamed `streamSpeech` result into bytes AND autosaves them to
 * `SPEECH_SDK_E2E_OUTPUT_DIR` using the current vitest test name. Use in place
 * of `collectStream(result.audio)` in e2e tests.
 */
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
