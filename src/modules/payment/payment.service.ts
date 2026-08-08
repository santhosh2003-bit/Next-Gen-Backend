import { prisma } from '../../common/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { ordersService } from '../orders/orders.service.js';
import { enqueueNotification } from '../../common/queue.js';
import { razorpay, verifyPaymentSignature } from './razorpay.client.js';
import { cache } from '../../common/redis.js';
import type { z } from 'zod';
import type { verifyPaymentSchema } from './payment.schema.js';

export const paymentService = {
  /**
   * Client-side verification flow: the app returns the Checkout handler
   * response; we verify the signature and, if valid, capture + confirm.
   */
  async verify(userId: string, input: z.infer<typeof verifyPaymentSchema>) {
    const payment = await prisma.payment.findUnique({
      where: { razorpayOrderId: input.razorpayOrderId },
      include: { order: true },
    });
    if (!payment) throw new NotFoundError('Payment not found');
    if (payment.order.userId !== userId) throw new BadRequestError('Not your payment');

    const valid = verifyPaymentSignature({
      razorpayOrderId: input.razorpayOrderId,
      razorpayPaymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
    });
    if (!valid) {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw new BadRequestError('Payment signature verification failed');
    }

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: 'CAPTURED',
          razorpayPaymentId: input.razorpayPaymentId,
          razorpaySignature: input.razorpaySignature,
        },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: 'capture',
          status: 'CAPTURED',
          amount: payment.amount,
          gatewayId: input.razorpayPaymentId,
        },
      });
      const order = await ordersService.confirmPaid(tx, payment.orderId);
      return { payment: updated, order };
    });
    await cache.invalidateNamespace('catalog');

    await enqueueNotification({
      userId,
      channel: 'PUSH',
      title: 'Payment successful',
      body: `Payment for order ${payment.order.orderNumber} confirmed.`,
      data: { orderId: payment.orderId },
    }).catch(() => undefined);

    return { status: 'CAPTURED', orderId: payment.orderId, orderStatus: result.order.status };
  },

  /**
   * Idempotent webhook processor. Stores the raw event, then reacts to
   * payment.captured / payment.failed / refund events.
   */
  async handleWebhook(eventId: string, event: string, payload: Record<string, unknown>, signature?: string) {
    // Idempotency: skip if we've already stored this event id.
    const existing = await prisma.razorpayWebhook.findUnique({ where: { eventId } });
    if (existing?.processed) return { skipped: true };

    await prisma.razorpayWebhook.upsert({
      where: { eventId },
      create: { eventId, event, payload: payload as object, signature },
      update: {},
    });

    const entity = (payload as { payload?: { payment?: { entity?: Record<string, unknown> } } }).payload
      ?.payment?.entity;
    const razorpayOrderId = entity?.order_id as string | undefined;

    if (razorpayOrderId && (event === 'payment.captured' || event === 'order.paid')) {
      const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
      if (payment && payment.status !== 'CAPTURED') {
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'CAPTURED', razorpayPaymentId: entity?.id as string },
          });
          await tx.paymentTransaction.create({
            data: {
              paymentId: payment.id,
              type: 'capture',
              status: 'CAPTURED',
              amount: payment.amount,
              gatewayId: entity?.id as string,
              raw: entity as object,
            },
          });
          await ordersService.confirmPaid(tx, payment.orderId);
        });
        await cache.invalidateNamespace('catalog');
      }
    }

    if (razorpayOrderId && event === 'payment.failed') {
      const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
      if (payment) {
        await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      }
    }

    await prisma.razorpayWebhook.update({ where: { eventId }, data: { processed: true } });
    return { processed: true };
  },

  /** Issue a refund via Razorpay and record the transaction. */
  async refund(orderId: string, amount?: number, reason?: string) {
    const payment = await prisma.payment.findFirst({
      where: { orderId, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
    });
    if (!payment) throw new NotFoundError('No captured payment for this order');
    if (!payment.razorpayPaymentId) throw new BadRequestError('Missing gateway payment id');

    const refundAmount = amount ?? Number(payment.amount);
    const refund = await razorpay.payments.refund(payment.razorpayPaymentId, {
      amount: Math.round(refundAmount * 100),
      notes: { reason: reason ?? 'requested_by_admin' },
    });

    const isFull = refundAmount >= Number(payment.amount);
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      await tx.paymentTransaction.create({
        data: {
          paymentId: payment.id,
          type: 'refund',
          status: isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
          amount: refundAmount,
          gatewayId: (refund as { id?: string }).id,
          raw: refund as object,
        },
      });
      await tx.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });
      await tx.orderStatusHistory.create({
        data: { orderId, status: 'REFUNDED', note: reason ?? 'Refund issued' },
      });
    });

    return { status: isFull ? 'REFUNDED' : 'PARTIALLY_REFUNDED', amount: refundAmount };
  },
};
