import { z } from 'zod';

export const createCouponSchema = z.object({
  code: z.string().min(3).max(40).transform((s) => s.toUpperCase()),
  type: z.enum(['PERCENTAGE', 'FIXED', 'FREE_SHIPPING']).default('PERCENTAGE'),
  value: z.number().nonnegative(),
  minOrder: z.number().nonnegative().optional(),
  maxDiscount: z.number().nonnegative().nullable().optional(),
  usageLimit: z.number().int().positive().nullable().optional(),
  perUserLimit: z.number().int().positive().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  isActive: z.boolean().optional(),
});

export const updateCouponSchema = createCouponSchema.partial();

export const applyCouponSchema = z.object({
  code: z.string().min(1),
});
