import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const refundSchema = z.object({
  amount: z.number().positive().optional(), // partial refund; full if omitted
  reason: z.string().optional(),
});
