export type TimestampsSource = "native" | "aligned" | "estimated";

export interface WordTimestamp {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export interface ConversationWordTimestamp extends WordTimestamp {
  readonly turnIndex: number;
}
