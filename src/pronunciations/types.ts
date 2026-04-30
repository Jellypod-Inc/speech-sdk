export interface Pronunciation {
  readonly caseSensitive?: boolean;
  readonly replacement: string;
  readonly word: string;
}

export interface PronunciationsInput {
  readonly dictionaryIds?: readonly string[];
  readonly rules?: readonly Pronunciation[];
}

export interface Edit {
  readonly originalRange: readonly [number, number];
  readonly originalWord: string;
  readonly replacementRange: readonly [number, number];
}
