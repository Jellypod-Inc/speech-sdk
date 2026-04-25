import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ConversationInputError,
  DialogueConstraintError,
  StitchUnsupportedError,
} from "../conversation/errors.js";
import { generateConversation } from "../generate-conversation.js";

interface PackageExport {
  default: string;
  types: string;
}

interface PackageJson {
  exports: Record<string, PackageExport>;
}

const JS_EXTENSION_RE = /\.js$/;

const packageJson = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8")
) as PackageJson;

const deepModuleExports = [
  ["./conversation", "./dist/generate-conversation.js"],
  ["./conversation/errors", "./dist/conversation/errors.js"],
  ["./openai", "./dist/providers/openai/index.js"],
  ["./elevenlabs", "./dist/providers/elevenlabs/index.js"],
  ["./deepgram", "./dist/providers/deepgram/index.js"],
  ["./cartesia", "./dist/providers/cartesia/index.js"],
  ["./hume", "./dist/providers/hume/index.js"],
  ["./inworld", "./dist/providers/inworld/index.js"],
  ["./google", "./dist/providers/google/index.js"],
  ["./fish-audio", "./dist/providers/fish-audio/index.js"],
  ["./murf", "./dist/providers/murf/index.js"],
  ["./resemble", "./dist/providers/resemble/index.js"],
  ["./fal-ai", "./dist/providers/fal/index.js"],
  ["./mistral", "./dist/providers/mistral/index.js"],
  ["./xai", "./dist/providers/xai/index.js"],
  ["./stt/openai", "./dist/stt-providers/openai/index.js"],
] as const;

describe("./conversation subpath exports", () => {
  it("exports generateConversation", () => {
    expect(typeof generateConversation).toBe("function");
  });

  it("exports conversation error classes from ./conversation/errors", () => {
    expect(typeof ConversationInputError).toBe("function");
    expect(typeof DialogueConstraintError).toBe("function");
    expect(typeof StitchUnsupportedError).toBe("function");
  });

  it.each(
    deepModuleExports
  )("keeps package.json deep module export %s", (subpath, defaultPath) => {
    expect(packageJson.exports[subpath]).toMatchObject({
      default: defaultPath,
      types: defaultPath.replace(JS_EXTENSION_RE, ".d.ts"),
    });
  });
});
