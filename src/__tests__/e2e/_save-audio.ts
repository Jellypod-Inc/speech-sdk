import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

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

/**
 * Write a test-generated audio file to `SPEECH_SDK_E2E_OUTPUT_DIR` if the env
 * var is set. No-op otherwise, so normal CI runs don't produce artifacts.
 * Intended to let conversation e2e tests double as a way to sample provider
 * output (e.g. `SPEECH_SDK_E2E_OUTPUT_DIR=~/Downloads/convos pnpm test:e2e`).
 */
export async function maybeSaveAudio(
  name: string,
  audio: { uint8Array: Uint8Array; mediaType: string }
): Promise<void> {
  const dir = process.env.SPEECH_SDK_E2E_OUTPUT_DIR;
  if (!dir) {
    return;
  }
  const expanded = dir.startsWith("~")
    ? join(process.env.HOME ?? "", dir.slice(1))
    : dir;
  await mkdir(expanded, { recursive: true });
  const file = join(expanded, `${name}.${extFor(audio.mediaType)}`);
  await writeFile(file, audio.uint8Array);
  console.log(`[maybeSaveAudio] wrote ${file}`);
}
