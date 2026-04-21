import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WordTimestamp } from "../timestamps.js";
import { maybeSaveResult } from "./e2e/_save-audio.js";

// When SPEECH_SDK_E2E_OUTPUT_DIR is unset, maybeSaveResult is a no-op. This
// suite drives that env var into a throwaway tmp dir, calls the helper, and
// asserts each generated sibling file shows up with the right bytes/text.

const originalEnv = process.env.SPEECH_SDK_E2E_OUTPUT_DIR;
let tmpDir: string;

const FAKE_AUDIO: { uint8Array: Uint8Array; mediaType: string } = {
  uint8Array: new Uint8Array([0x49, 0x44, 0x33, 0x03, 0x00]), // "ID3" header bytes
  mediaType: "audio/mpeg",
};

const FAKE_TIMESTAMPS: WordTimestamp[] = [
  { text: "Hello", start: 0, end: 0.5 },
  { text: "world.", start: 0.5, end: 1 },
];

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "speech-sdk-save-result-"));
  process.env.SPEECH_SDK_E2E_OUTPUT_DIR = tmpDir;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  if (originalEnv === undefined) {
    process.env.SPEECH_SDK_E2E_OUTPUT_DIR = undefined;
    delete process.env.SPEECH_SDK_E2E_OUTPUT_DIR;
  } else {
    process.env.SPEECH_SDK_E2E_OUTPUT_DIR = originalEnv;
  }
});

describe("maybeSaveResult", () => {
  it("writes only the audio file when timestamps are omitted", async () => {
    await maybeSaveResult("audio-only-case", FAKE_AUDIO);
    const bucket = join(tmpDir, "save-result.test.ts");
    const files = await readdir(bucket);
    expect(files).toEqual(["audio-only-case.mp3"]);
  });

  it("writes audio + timestamps.json + srt + vtt when timestamps present", async () => {
    await maybeSaveResult("with-caps", FAKE_AUDIO, FAKE_TIMESTAMPS);
    const bucket = join(tmpDir, "save-result.test.ts");
    const files = (await readdir(bucket)).sort();
    expect(files).toEqual([
      "with-caps.mp3",
      "with-caps.srt",
      "with-caps.timestamps.json",
      "with-caps.vtt",
    ]);

    const srt = await readFile(join(bucket, "with-caps.srt"), "utf8");
    expect(srt).toBe("1\n00:00:00,000 --> 00:00:01,000\nHello world.\n\n");

    const vtt = await readFile(join(bucket, "with-caps.vtt"), "utf8");
    expect(vtt).toBe(
      "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHello world.\n\n"
    );

    const ts = JSON.parse(
      await readFile(join(bucket, "with-caps.timestamps.json"), "utf8")
    );
    expect(ts).toEqual(FAKE_TIMESTAMPS);
  });

  it("skips timestamp/caption files when timestamps array is empty", async () => {
    await maybeSaveResult("empty-ts", FAKE_AUDIO, []);
    const bucket = join(tmpDir, "save-result.test.ts");
    const files = await readdir(bucket);
    expect(files).toEqual(["empty-ts.mp3"]);
  });

  it("shares a stem across paired files on repeat calls (suffix -2)", async () => {
    await maybeSaveResult("dup", FAKE_AUDIO, FAKE_TIMESTAMPS);
    await maybeSaveResult("dup", FAKE_AUDIO, FAKE_TIMESTAMPS);
    const bucket = join(tmpDir, "save-result.test.ts");
    const files = (await readdir(bucket)).sort();
    expect(files).toEqual([
      "dup-2.mp3",
      "dup-2.srt",
      "dup-2.timestamps.json",
      "dup-2.vtt",
      "dup.mp3",
      "dup.srt",
      "dup.timestamps.json",
      "dup.vtt",
    ]);
  });

  it("is a no-op when the env var is unset", async () => {
    process.env.SPEECH_SDK_E2E_OUTPUT_DIR = undefined;
    delete process.env.SPEECH_SDK_E2E_OUTPUT_DIR;
    await maybeSaveResult("noop", FAKE_AUDIO, FAKE_TIMESTAMPS);
    // Nothing was written: tmpDir stays empty.
    const files = await readdir(tmpDir);
    expect(files).toEqual([]);
  });
});
