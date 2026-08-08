import { z } from 'zod';

export const createFeedbackSchema = z.object({
  message: z.string().min(3).max(4000),
  rating: z.number().int().min(1).max(5).optional(),
  category: z.string().max(60).optional(),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;
