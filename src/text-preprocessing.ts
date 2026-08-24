import {
  detectAudioTags,
  stripAudioTags,
  textWithoutAudioTags,
} from "./audio-tags.js";
import type { ResolvedModel } from "./speech-provider.js";

export interface PreprocessedSpeechText {
  readonly canonicalText: string;
  readonly providerText: string;
  readonly warnings: string[];
}

export function preprocessSpeechText(args: {
  readonly modelIdentifier: string;
  readonly rawText: string;
  readonly resolved: ResolvedModel;
}): PreprocessedSpeechText {
  const canonicalText = textWithoutAudioTags(args.rawText);

  if (args.resolved.provider.processAudioTags) {
    const processed = args.resolved.provider.processAudioTags(
      args.rawText,
      args.resolved.modelId
    );
    return {
      canonicalText,
      providerText: processed.text,
      warnings: processed.warnings,
    };
  }

  const tags = detectAudioTags(args.rawText);
  if (tags.length > 0) {
    const processed = stripAudioTags(args.rawText, args.modelIdentifier);
    return {
      canonicalText: processed.text,
      providerText: processed.text,
      warnings: processed.warnings,
    };
  }

  return {
    canonicalText: args.rawText,
    providerText: args.rawText,
    warnings: [],
  };
}
