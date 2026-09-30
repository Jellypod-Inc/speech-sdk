/** Legacy rule shape: `replacement` is sent to every model. */
export interface Pronunciation {
  readonly caseSensitive?: boolean;
  readonly replacement: string;
  readonly word: string;
}

export interface PronunciationRule {
  readonly caseSensitive?: boolean;
  /** Used only by models that read IPA; other models receive `respelling`. */
  readonly ipa?: string;
  readonly respelling: string;
  readonly word: string;
}

export type PronunciationInputRule = Pronunciation | PronunciationRule;

export interface PronunciationsInput {
  readonly rules?: readonly PronunciationInputRule[];
}

export type PronunciationForm = "respelling" | "ipa";

export interface PronunciationTarget {
  readonly model?: string;
  readonly provider: string;
}

export interface MergedPronunciation {
  readonly caseSensitive: boolean;
  readonly form: PronunciationForm;
  /** Exactly what synthesis substitutes for this model. */
  readonly replacement: string;
  readonly word: string;
}

export interface ResolvedPronunciation extends MergedPronunciation {
  /** As `ruleMapKey` produces it. */
  readonly ruleKey: string;
}

export interface Edit {
  readonly originalRange: readonly [number, number];
  readonly originalWord: string;
  readonly replacementRange: readonly [number, number];
  readonly ruleKey: string;
}
