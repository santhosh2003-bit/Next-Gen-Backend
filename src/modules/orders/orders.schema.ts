import { z } from 'zod';

export const listOrdersQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  status: z
    .enum(['PENDING', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'REFUNDED'])
    .optional(),
});

export const updateStatusSchema = z.object({
  status: z.enum([
    'PENDING',
    'CONFIRMED',
    'PACKED',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED',
    'RETURNED',
    'REFUNDED',
  ]),
  note: z.string().optional(),
  expectedDeliveryAt: z.string().datetime().nullable().optional(),
});

export const markPaidSchema = z.object({
  paid: z.boolean(),
});
