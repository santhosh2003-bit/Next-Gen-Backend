import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  imageUrl: z.string().url().optional(),
  position: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateCategorySchema = createCategorySchema.partial();
