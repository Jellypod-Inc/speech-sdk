import { nonEmptyInstructions } from "../instructions.js";
import { substitute } from "../pronunciations/substitute.js";
import type { Edit, Pronunciation } from "../pronunciations/types.js";
import type { ResolvedModel, Voice } from "../speech-provider.js";
import { preprocessSpeechText } from "../text-preprocessing.js";
import type { ConversationTurn } from "./types.js";

export interface PreparedConversationTurn<V extends Voice = Voice> {
  readonly canonicalText: string;
  readonly edits: readonly Edit[];
  readonly instructions?: string;
  readonly originalText: string;
  readonly text: string;
  readonly voice: V;
  readonly warnings: readonly string[];
}

export function buildSubstitutedTurns<V extends Voice>(
  turns: readonly ConversationTurn<V>[],
  resolved: ResolvedModel<V>,
  ruleMap: Map<string, Pronunciation> | null
): readonly PreparedConversationTurn<V>[] {
  return turns.map((turn) => {
    const processed = preprocessSpeechText({
      resolved,
      rawText: turn.text,
      modelIdentifier: `${resolved.provider.id}/${resolved.modelId}`,
    });
    if (!ruleMap) {
      return {
        voice: turn.voice,
        text: processed.providerText,
        canonicalText: processed.canonicalText,
        originalText: processed.canonicalText,
        instructions: nonEmptyInstructions(turn.instructions),
        edits: [] as readonly Edit[],
        warnings: processed.warnings,
      };
    }
    const canonicalSubstitution = substitute(processed.canonicalText, ruleMap);
    return {
      voice: turn.voice,
      text: substitute(processed.providerText, ruleMap).text,
      canonicalText: canonicalSubstitution.text,
      originalText: processed.canonicalText,
      instructions: nonEmptyInstructions(turn.instructions),
      edits: canonicalSubstitution.edits,
      warnings: processed.warnings,
    };
  });
}
