export interface GeneratedAudioFile {
  readonly uint8Array: Uint8Array;
  readonly base64: string;
  readonly mediaType: string;
  readonly format: string;
}

export interface SpeechResult {
  readonly audio: GeneratedAudioFile;
  readonly providerMetadata?: Record<string, unknown>;
}

function deriveFormat(mediaType: string): string {
  if (mediaType === 'audio/mpeg') return 'mp3';
  const parts = mediaType.split('/');
  return parts.length === 2 ? parts[1] : 'mp3';
}

export class DefaultGeneratedAudioFile implements GeneratedAudioFile {
  readonly mediaType: string;
  readonly format: string;

  private _data: string | Uint8Array;
  private _uint8Array?: Uint8Array;
  private _base64?: string;

  constructor({ data, mediaType }: { data: string | Uint8Array; mediaType: string }) {
    this._data = data;
    this.mediaType = mediaType;
    this.format = deriveFormat(mediaType);
  }

  get uint8Array(): Uint8Array {
    if (this._uint8Array != null) return this._uint8Array;
    if (this._data instanceof Uint8Array) {
      this._uint8Array = this._data;
    } else {
      const binaryString = atob(this._data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      this._uint8Array = bytes;
    }
    return this._uint8Array;
  }

  get base64(): string {
    if (this._base64 != null) return this._base64;
    if (typeof this._data === 'string') {
      this._base64 = this._data;
    } else {
      let binaryString = '';
      for (let i = 0; i < this._data.length; i++) {
        binaryString += String.fromCharCode(this._data[i]);
      }
      this._base64 = btoa(binaryString);
    }
    return this._base64;
  }
}
