import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env.js';

/**
 * Thin wrapper around the Razorpay SDK. In non-production without real keys it
 * still works for order creation via the SDK; signature verification is pure
 * crypto and always available.
 */
export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});

/** Create a Razorpay order. Amount is in the smallest currency unit (paise). */
export async function createRazorpayOrder(params: {
  amount: number; // rupees
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}) {
  return razorpay.orders.create({
    amount: Math.round(params.amount * 100),
    currency: params.currency,
    receipt: params.receipt,
    notes: params.notes,
  });
}

/** Verify the checkout signature returned by Razorpay Checkout on the client. */
export function verifyPaymentSignature(params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  signature: string;
}): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_KEY_SECRET)
    .update(`${params.razorpayOrderId}|${params.razorpayPaymentId}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.signature));
}

/** Verify a webhook payload signature against the configured webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const expected = crypto
    .createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
