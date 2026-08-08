import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();
