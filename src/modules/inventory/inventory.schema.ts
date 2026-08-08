import { z } from 'zod';

export const createWarehouseSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(30),
  address: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const upsertInventorySchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid(),
  quantity: z.number().int().min(0),
  reorderLevel: z.number().int().min(0).optional(),
});

export const adjustStockSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid(),
  delta: z.number().int(),
  reference: z.string().optional(),
});
