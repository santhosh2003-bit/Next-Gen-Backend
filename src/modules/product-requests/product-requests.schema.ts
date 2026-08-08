import { z } from 'zod';

export const createProductRequestSchema = z.object({
  phone: z.string().min(6).max(20),
  items: z.string().min(2).max(4000),
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional().or(z.literal('')),
  note: z.string().max(2000).optional(),
});

export const updateRequestStatusSchema = z.object({
  status: z.enum(['NEW', 'CONTACTED', 'CLOSED']),
});

export type CreateProductRequestInput = z.infer<typeof createProductRequestSchema>;
