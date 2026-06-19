import { describe, expect, it, vi } from "vitest";
import { InvalidCloneFieldError } from "../errors.js";
import { SDK_USER_AGENT } from "../provider-utils.js";
import { MiniMaxSpeechProvider } from "../providers/minimax/index.js";

const sample = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: "audio/wav",
};

function uploadResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      file: { file_id: 12_345 },
      base_resp: { status_code: 0 },
    }),
  };
}

function cloneResponse() {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({
      base_resp: { status_code: 0, status_msg: "success" },
    }),
  };
}

describe("MiniMaxSpeechProvider.cloneVoice", () => {
  it("uploads then clones, threading file_id and using name as voice_id", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(uploadResponse())
      .mockResolvedValueOnce(cloneResponse());

    const provider = new MiniMaxSpeechProvider({
      apiKey: "minimax-key",
      groupId: "group-1",
      fetch: mockFetch,
    });

    const result = await provider.cloneVoice({
      modelId: "speech-2.8-hd",
      samples: [sample],
      name: "MyCloneVoice01",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadInit] = mockFetch.mock.calls[0];
    expect(uploadUrl).toBe(
      "https://api.minimax.io/v1/files/upload?GroupId=group-1"
    );
    expect(uploadInit.method).toBe("POST");
    expect(uploadInit.headers.Authorization).toBe("Bearer minimax-key");
    expect(uploadInit.headers["X-User-Agent"]).toBe(SDK_USER_AGENT);
    expect(uploadInit.body).toBeInstanceOf(FormData);
    const uploadForm = uploadInit.body as FormData;
    expect(uploadForm.get("purpose")).toBe("voice_clone");
    expect(uploadForm.get("file")).toBeInstanceOf(Blob);

    const [cloneUrl, cloneInit] = mockFetch.mock.calls[1];
    expect(cloneUrl).toBe(
      "https://api.minimax.io/v1/voice_clone?GroupId=group-1"
    );
    expect(cloneInit.headers["Content-Type"]).toBe("application/json");
    const cloneBody = JSON.parse(cloneInit.body);
    expect(cloneBody.voice_id).toBe("MyCloneVoice01");
    expect(cloneBody.file_id).toBe(12_345);

    expect(result.voiceId).toBe("MyCloneVoice01");
  });

  it("throws InvalidCloneFieldError for an invalid name and makes zero fetch calls", async () => {
    const mockFetch = vi.fn();

    const provider = new MiniMaxSpeechProvider({
      apiKey: "minimax-key",
      groupId: "group-1",
      fetch: mockFetch,
    });

    await expect(
      provider.cloneVoice({
        modelId: "speech-2.8-hd",
        samples: [sample],
        name: "bob",
      })
    ).rejects.toBeInstanceOf(InvalidCloneFieldError);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("raises an ApiError when base_resp signals a logical error", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(uploadResponse())
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          base_resp: { status_code: 1004, status_msg: "bad auth" },
        }),
      });

    const provider = new MiniMaxSpeechProvider({
      apiKey: "minimax-key",
      groupId: "group-1",
      fetch: mockFetch,
    });

    await expect(
      provider.cloneVoice({
        modelId: "speech-2.8-hd",
        samples: [sample],
        name: "MyCloneVoice01",
      })
    ).rejects.toThrow();
  });
});
