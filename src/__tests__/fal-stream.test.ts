import { describe, expect, it } from "vitest";
import { StreamingNotSupportedError } from "../errors.js";
import { FalSpeechProvider } from "../providers/fal/index.js";

describe("FalSpeechProvider.stream", () => {
  it("throws StreamingNotSupportedError", async () => {
    const provider = new FalSpeechProvider({ apiKey: "fal-test" });
    await expect(
      provider.stream?.({ modelId: "kokoro", text: "hi" })
    ).rejects.toBeInstanceOf(StreamingNotSupportedError);
  });
});
