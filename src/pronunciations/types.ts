export interface Pronunciation {
  readonly word: string;
  readonly replacement: string;
  readonly caseSensitive?: boolean;
}

export interface PronunciationsInput {
  readonly dictionaryIds?: readonly string[];
  readonly rules?: readonly Pronunciation[];
}

export interface Edit {
  readonly originalRange: readonly [number, number];
  readonly replacementRange: readonly [number, number];
  readonly originalWord: string;
}
