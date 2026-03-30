import { z } from 'zod';

export const elevenlabsSpeechOptionsSchema = z.object({
  voiceSettings: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      similarityBoost: z.number().min(0).max(1).optional(),
      style: z.number().min(0).max(1).optional(),
      speed: z.number().optional(),
      useSpeakerBoost: z.boolean().optional(),
    })
    .optional(),
  previousRequestIds: z.array(z.string()).max(3).optional(),
  nextRequestIds: z.array(z.string()).max(3).optional(),
  previousText: z.string().optional(),
  nextText: z.string().optional(),
  seed: z.number().int().min(0).max(4294967295).optional(),
  languageCode: z.string().optional(),
  outputFormat: z.string().optional(),
  applyTextNormalization: z.enum(['auto', 'on', 'off']).optional(),
  applyLanguageTextNormalization: z.boolean().optional(),
  pronunciationDictionaryLocators: z
    .array(
      z.object({
        pronunciationDictionaryId: z.string(),
        versionId: z.string().optional(),
      }),
    )
    .max(3)
    .optional(),
});

export type ElevenLabsSpeechOptions = z.infer<typeof elevenlabsSpeechOptionsSchema>;
