import { z } from 'zod';

export const createBrandSchema = z.object({
  name: z.string().min(1).max(120),
  logoUrl: z.string().url().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();

export const bulkCreateBrandSchema = z.object({
  items: z.array(createBrandSchema).min(1).max(1000),
});
