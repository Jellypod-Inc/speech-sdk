import { describe, expect, it } from "vitest";
import { DefaultGeneratedAudioFile } from "../speech-result.js";

describe("DefaultGeneratedAudioFile", () => {
  it("lazily computes base64 from Uint8Array", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const file = new DefaultGeneratedAudioFile({
      data,
      mediaType: "audio/mpeg",
    });
    expect(file.base64).toBe(btoa("Hello"));
  });

  it("lazily computes uint8Array from base64", () => {
    const b64 = btoa("Hello");
    const file = new DefaultGeneratedAudioFile({
      data: b64,
      mediaType: "audio/mpeg",
    });
    expect(file.uint8Array).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it("exposes mediaType", () => {
    const file = new DefaultGeneratedAudioFile({
      data: new Uint8Array([1]),
      mediaType: "audio/wav",
    });
    expect(file.mediaType).toBe("audio/wav");
  });
});
