import { z } from 'zod';

export const openaiSpeechOptionsSchema = z.object({
  speed: z.number().min(0.25).max(4.0).optional(),
  instructions: z.string().optional(),
  outputFormat: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
});

export type OpenAISpeechOptions = z.infer<typeof openaiSpeechOptionsSchema>;
