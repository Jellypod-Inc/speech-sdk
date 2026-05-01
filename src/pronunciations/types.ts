export interface Pronunciation {
  readonly caseSensitive?: boolean;
  readonly replacement: string;
  readonly word: string;
}

export interface PronunciationsInput {
  readonly dictionaryIds?: readonly string[];
  readonly rules?: readonly Pronunciation[];
}

// Direct providers can't reach the gateway dictionary store; bare-string models always do.
export type DirectPronunciationsInput = Omit<
  PronunciationsInput,
  "dictionaryIds"
>;

export type PronunciationsFor<M> = M extends string
  ? PronunciationsInput
  : DirectPronunciationsInput;

export interface Edit {
  readonly originalRange: readonly [number, number];
  readonly originalWord: string;
  readonly replacementRange: readonly [number, number];
  readonly ruleKey: string;
}
