import { z } from 'zod';

export const checkoutSchema = z.object({
  addressId: z.string().uuid(),
  paymentMethod: z.enum(['RAZORPAY', 'COD']).default('RAZORPAY'),
  notes: z.string().max(500).optional(),
});
