import { prisma } from '../../common/prisma.js';
import { env } from '../../config/env.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { computeTotals } from '../../common/pricing.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { couponsService } from '../coupons/coupons.service.js';
import { ordersService } from '../orders/orders.service.js';
import { createRazorpayOrder } from '../payment/razorpay.client.js';
import { enqueueNotification } from '../../common/queue.js';
import { cache } from '../../common/redis.js';
import type { z } from 'zod';
import type { checkoutSchema } from './checkout.schema.js';

export const checkoutService = {
  /**
   * Turn the user's active cart into an order:
   *  1. validate cart + address
   *  2. reserve inventory (transaction)
   *  3. compute totals (with coupon), snapshot line items
   *  4. create the Payment (Razorpay order for online, COD otherwise)
   */
  async placeOrder(userId: string, input: z.infer<typeof checkoutSchema>) {
    const cart = await prisma.cart.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: { items: { include: { product: true, variant: true } } },
    });
    if (!cart || cart.items.length === 0) throw new BadRequestError('Cart is empty');

    const address = await prisma.address.findFirst({ where: { id: input.addressId, userId } });
    if (!address) throw new NotFoundError('Address not found');

    // Re-price against current product data.
    const lines = cart.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      name: i.product.name,
      sku: i.variant?.sku ?? i.product.sku,
      unit: i.unit ?? i.product.unit,
      quantity: i.quantity,
      unitPrice: Number(i.variant?.salePrice ?? i.variant?.price ?? i.product.salePrice ?? i.product.price),
      taxRate: Number(i.product.taxRate),
    }));

    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    // Coupon
    let discount = 0;
    let couponEval: Awaited<ReturnType<typeof couponsService.evaluate>> | null = null;
    if (cart.couponCode) {
      couponEval = await couponsService.evaluate(cart.couponCode, userId, subtotal);
      discount = couponEval.discount;
    }

    const totals = computeTotals(
      lines.map((l) => ({ unitPrice: l.unitPrice, quantity: l.quantity, taxRate: l.taxRate })),
      { discount },
    );

    const order = await prisma.$transaction(async (tx) => {
      // Reserve stock (throws if insufficient).
      await inventoryService.reserve(
        tx,
        lines.map((l) => ({ productId: l.productId, variantId: l.variantId, quantity: l.quantity })),
        'checkout',
      );

      const created = await tx.order.create({
        data: {
          orderNumber: ordersService.generateOrderNumber(),
          userId,
          addressId: address.id,
          status: 'PENDING',
          subtotal: totals.subtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          shippingTotal: totals.shippingTotal,
          grandTotal: totals.grandTotal,
          currency: env.CURRENCY,
          couponCode: cart.couponCode,
          notes: input.notes,
          items: {
            create: lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              name: l.name,
              sku: l.sku,
              unit: l.unit,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              taxRate: l.taxRate,
              lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100,
            })),
          },
          statusHistory: { create: { status: 'PENDING', note: 'Order placed' } },
        },
      });

      if (couponEval) {
        await couponsService.recordUsage(tx, couponEval.coupon.id, userId, created.id, discount);
      }

      // Mark cart converted.
      await tx.cart.update({ where: { id: cart.id }, data: { status: 'CONVERTED' } });

      return created;
    });
    // Product details expose availability, so reservations must refresh storefront stock.
    await cache.invalidateNamespace('catalog');

    // Create the payment record + gateway order.
    let razorpayOrder: { id: string } | null = null;
    if (input.paymentMethod === 'RAZORPAY') {
      const rp = await createRazorpayOrder({
        amount: totals.grandTotal,
        currency: env.CURRENCY,
        receipt: order.orderNumber,
        notes: { orderId: order.id, userId },
      });
      razorpayOrder = { id: rp.id };
      await prisma.payment.create({
        data: {
          orderId: order.id,
          method: 'RAZORPAY',
          status: 'CREATED',
          amount: totals.grandTotal,
          currency: env.CURRENCY,
          razorpayOrderId: rp.id,
        },
      });
    } else {
      // COD: create a payment stub; order is confirmed on delivery.
      await prisma.payment.create({
        data: {
          orderId: order.id,
          method: 'COD',
          status: 'CREATED',
          amount: totals.grandTotal,
          currency: env.CURRENCY,
        },
      });
    }

    await enqueueNotification({
      userId,
      channel: 'PUSH',
      title: 'Order placed',
      body: `Order ${order.orderNumber} placed successfully.`,
      data: { orderId: order.id },
    }).catch(() => undefined);

    return {
      order: { id: order.id, orderNumber: order.orderNumber, grandTotal: totals.grandTotal },
      totals,
      payment:
        input.paymentMethod === 'RAZORPAY'
          ? {
              provider: 'razorpay',
              razorpayOrderId: razorpayOrder!.id,
              razorpayKeyId: env.RAZORPAY_KEY_ID,
              amount: Math.round(totals.grandTotal * 100),
              currency: env.CURRENCY,
            }
          : { provider: 'cod' },
    };
  },
};
