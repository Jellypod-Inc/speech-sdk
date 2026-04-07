export interface ParseSseBase64Options {
  extractBase64(eventData: string): string | null;
  extractMetadata?(eventData: string): Record<string, unknown> | null;
}

export interface ParseSseBase64Result {
  metadata: Promise<Record<string, unknown> | undefined>;
  stream: ReadableStream<Uint8Array>;
}

const LEADING_SPACE = /^ /;

function base64ToBytes(b64: string): Uint8Array {
  const binaryString = atob(b64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function parseEventData(rawEvent: string): string | null {
  const dataLines: string[] = [];
  for (const rawLine of rawEvent.split("\n")) {
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).replace(LEADING_SPACE, ""));
    }
  }
  if (dataLines.length === 0) {
    return null;
  }
  return dataLines.join("\n");
}

function processEvent(
  eventData: string,
  options: ParseSseBase64Options,
  controller: ReadableStreamDefaultController<Uint8Array>,
  setMetadata: (m: Record<string, unknown> | undefined) => void
): void {
  const b64 = options.extractBase64(eventData);
  if (b64) {
    controller.enqueue(base64ToBytes(b64));
  }
  if (options.extractMetadata) {
    const m = options.extractMetadata(eventData);
    if (m) {
      setMetadata(m);
    }
  }
}

function drainBuffer(
  state: { buffer: string },
  options: ParseSseBase64Options,
  controller: ReadableStreamDefaultController<Uint8Array>,
  setMetadata: (m: Record<string, unknown> | undefined) => void
): void {
  for (;;) {
    const lfIndex = state.buffer.indexOf("\n\n");
    const crlfIndex = state.buffer.indexOf("\r\n\r\n");
    let sepIndex: number;
    let sepLength: number;
    if (crlfIndex !== -1 && (lfIndex === -1 || crlfIndex < lfIndex)) {
      sepIndex = crlfIndex;
      sepLength = 4;
    } else if (lfIndex === -1) {
      break;
    } else {
      sepIndex = lfIndex;
      sepLength = 2;
    }
    const rawEvent = state.buffer.slice(0, sepIndex);
    state.buffer = state.buffer.slice(sepIndex + sepLength);
    const eventData = parseEventData(rawEvent);
    if (eventData === null) {
      continue;
    }
    processEvent(eventData, options, controller, setMetadata);
  }
}

export function parseSseBase64Stream(
  source: ReadableStream<Uint8Array>,
  options: ParseSseBase64Options
): ParseSseBase64Result {
  let resolveMetadata!: (v: Record<string, unknown> | undefined) => void;
  const metadata = new Promise<Record<string, unknown> | undefined>((res) => {
    resolveMetadata = res;
  });
  let metadataResolved = false;
  const setMetadata = (m: Record<string, unknown> | undefined) => {
    if (metadataResolved) {
      return;
    }
    metadataResolved = true;
    resolveMetadata(m);
  };

  const decoder = new TextDecoder();
  const state = { buffer: "" };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = source.getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            state.buffer += decoder.decode();
            drainBuffer(state, options, controller, setMetadata);
            break;
          }
          state.buffer += decoder.decode(value, { stream: true });
          drainBuffer(state, options, controller, setMetadata);
        }
        controller.close();
        setMetadata(undefined);
      } catch (err) {
        controller.error(err);
        setMetadata(undefined);
      }
    },
  });

  return { stream, metadata };
}
