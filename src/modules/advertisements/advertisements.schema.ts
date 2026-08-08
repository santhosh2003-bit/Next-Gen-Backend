import { z } from 'zod';

export const createAdSchema = z.object({
  title: z.string().min(1).max(160),
  subtitle: z.string().max(300).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  linkType: z.enum(['none', 'product', 'category', 'url']).default('none'),
  linkTarget: z.string().max(500).optional(),
  ctaLabel: z.string().max(60).optional(),
  isActive: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
});

export const updateAdSchema = createAdSchema.partial();

export type CreateAdInput = z.infer<typeof createAdSchema>;
export type UpdateAdInput = z.infer<typeof updateAdSchema>;
