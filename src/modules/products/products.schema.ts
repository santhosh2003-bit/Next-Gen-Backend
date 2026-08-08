import { z } from 'zod';

export const productImageSchema = z.object({
  url: z.string().url(),
  alt: z.string().optional(),
  position: z.number().int().min(0).optional(),
  isPrimary: z.boolean().optional(),
});

export const productVariantSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  price: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().optional(),
  options: z.record(z.string()).optional(),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  brandId: z.string().uuid().nullable().optional(),
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  shortDescription: z.string().max(500).optional(),
  description: z.string().optional(),
  price: z.number().nonnegative(),
  salePrice: z.number().nonnegative().optional(),
  unit: z.string().min(1).max(20).optional(),
  taxRate: z.number().min(0).max(100).optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK']).optional(),
  attributes: z.record(z.any()).optional(),
  images: z.array(productImageSchema).optional(),
  variants: z.array(productVariantSchema).optional(),
});

export const updateProductSchema = createProductSchema.partial().omit({ images: true, variants: true });

export const listProductsQuery = z.object({
  page: z.coerce.number().optional(),
  pageSize: z.coerce.number().optional(),
  search: z.string().optional(),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'ACTIVE', 'ARCHIVED', 'OUT_OF_STOCK']).optional(),
  minPrice: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'name']).optional(),
});
