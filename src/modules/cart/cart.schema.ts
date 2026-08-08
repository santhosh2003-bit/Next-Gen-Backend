import { z } from 'zod';

export const addItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(999).default(1),
  unit: z.string().max(20).optional(),
});

export const updateItemSchema = z.object({
  quantity: z.number().int().min(1).max(999),
});

export const applyCartCouponSchema = z.object({
  code: z.string().min(1).nullable(),
});
