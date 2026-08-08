import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import type { z } from 'zod';
import type { createCouponSchema, updateCouponSchema } from './coupons.schema.js';

export interface CouponEvaluation {
  coupon: { id: string; code: string; type: string };
  discount: number; // amount applied to subtotal
  freeShipping: boolean;
}

export const couponsService = {
  async list() {
    return prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
  },

  async create(input: z.infer<typeof createCouponSchema>) {
    return prisma.coupon.create({ data: input });
  },

  async update(id: string, input: z.infer<typeof updateCouponSchema>) {
    const existing = await prisma.coupon.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Coupon not found');
    return prisma.coupon.update({ where: { id }, data: input });
  },

  async remove(id: string) {
    await prisma.coupon.delete({ where: { id } }).catch(() => {
      throw new NotFoundError('Coupon not found');
    });
    return { success: true };
  },

  /**
   * Validate a coupon for a given user + subtotal and compute the discount.
   * Pure validation — does not increment usage (that happens at order commit).
   */
  async evaluate(code: string, userId: string, subtotal: number): Promise<CouponEvaluation> {
    const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
    if (!coupon || !coupon.isActive) throw new BadRequestError('Invalid coupon code');

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestError('Coupon not active yet');
    if (coupon.expiresAt && coupon.expiresAt < now) throw new BadRequestError('Coupon has expired');
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit)
      throw new BadRequestError('Coupon usage limit reached');
    if (subtotal < Number(coupon.minOrder))
      throw new BadRequestError(`Minimum order of ${coupon.minOrder} required`);

    const userUses = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (userUses >= coupon.perUserLimit)
      throw new BadRequestError('You have already used this coupon');

    let discount = 0;
    let freeShipping = false;
    if (coupon.type === 'PERCENTAGE') {
      discount = (subtotal * Number(coupon.value)) / 100;
      if (coupon.maxDiscount != null) discount = Math.min(discount, Number(coupon.maxDiscount));
    } else if (coupon.type === 'FIXED') {
      discount = Number(coupon.value);
    } else if (coupon.type === 'FREE_SHIPPING') {
      freeShipping = true;
    }
    discount = Math.min(discount, subtotal);
    discount = Math.round(discount * 100) / 100;

    return { coupon: { id: coupon.id, code: coupon.code, type: coupon.type }, discount, freeShipping };
  },

  /** Record usage inside an order transaction. */
  async recordUsage(
    tx: Prisma.TransactionClient,
    couponId: string,
    userId: string,
    orderId: string,
    discount: number,
  ) {
    await tx.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    await tx.couponUsage.create({ data: { couponId, userId, orderId, discount } });
  },
};
