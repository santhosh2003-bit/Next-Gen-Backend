import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { computeTotals } from '../../common/pricing.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { couponsService } from '../coupons/coupons.service.js';
import type { z } from 'zod';
import type { addItemSchema, updateItemSchema } from './cart.schema.js';

const cartInclude = {
  items: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          slug: true,
          taxRate: true,
          status: true,
          unit: true,
          images: { select: { url: true }, orderBy: [{ isPrimary: 'desc' as const }, { position: 'asc' as const }], take: 1 },
        },
      },
      variant: { select: { id: true, name: true, options: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

function effectivePrice(product: { price: unknown; salePrice: unknown }, variant?: { price: unknown; salePrice: unknown } | null) {
  const base = variant?.salePrice ?? variant?.price ?? product.salePrice ?? product.price;
  return Number(base);
}

export const cartService = {
  /** Get or lazily create the user's active cart. */
  async getOrCreate(userId: string): Promise<CartWithItems> {
    let cart = await prisma.cart.findFirst({
      where: { userId, status: 'ACTIVE' },
      include: cartInclude,
    });
    if (!cart) {
      cart = await prisma.cart.create({ data: { userId, status: 'ACTIVE' }, include: cartInclude });
    }
    return cart;
  },

  async view(userId: string) {
    const cart = await this.getOrCreate(userId);
    return this.decorate(cart);
  },

  /** Attach computed totals (and coupon discount if applied). */
  async decorate(cart: CartWithItems) {
    const lines = cart.items.map((i) => ({
      unitPrice: Number(i.unitPrice),
      quantity: i.quantity,
      taxRate: Number(i.product.taxRate),
    }));

    let discount = 0;
    let couponError: string | undefined;
    if (cart.couponCode && cart.userId) {
      const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
      try {
        const evaln = await couponsService.evaluate(cart.couponCode, cart.userId, subtotal);
        discount = evaln.discount;
      } catch (e) {
        couponError = (e as Error).message;
      }
    }

    const totals = computeTotals(lines, { discount });
    return {
      id: cart.id,
      couponCode: cart.couponCode,
      couponError,
      itemCount: cart.items.reduce((s, i) => s + i.quantity, 0),
      items: cart.items,
      totals,
    };
  },

  async addItem(userId: string, input: z.infer<typeof addItemSchema>) {
    const product = await prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
    });
    if (!product) throw new NotFoundError('Product not found');
    if (product.status !== 'ACTIVE') throw new BadRequestError('Product is not purchasable');

    let variant = null;
    if (input.variantId) {
      variant = await prisma.productVariant.findFirst({
        where: { id: input.variantId, productId: input.productId },
      });
      if (!variant) throw new NotFoundError('Variant not found');
    }

    const available = await inventoryService.availableForProduct(input.productId, input.variantId ?? null);
    if (available < input.quantity) throw new BadRequestError('Not enough stock available');

    const cart = await this.getOrCreate(userId);
    const unitPrice = effectivePrice(product, variant);

    const existing = cart.items.find(
      (i) => i.productId === input.productId && (i.variantId ?? null) === (input.variantId ?? null),
    );

    if (existing) {
      const newQty = existing.quantity + input.quantity;
      if (available < newQty) throw new BadRequestError('Not enough stock available');
      await prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQty, unitPrice, ...(input.unit ? { unit: input.unit } : {}) },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: input.productId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          unitPrice,
          unit: input.unit ?? null,
        },
      });
    }
    return this.view(userId);
  },

  async updateItem(userId: string, itemId: string, input: z.infer<typeof updateItemSchema>) {
    const cart = await this.getOrCreate(userId);
    const item = cart.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundError('Cart item not found');

    const available = await inventoryService.availableForProduct(item.productId, item.variantId);
    if (available < input.quantity) throw new BadRequestError('Not enough stock available');

    await prisma.cartItem.update({ where: { id: itemId }, data: { quantity: input.quantity } });
    return this.view(userId);
  },

  async removeItem(userId: string, itemId: string) {
    const cart = await this.getOrCreate(userId);
    await prisma.cartItem.deleteMany({ where: { id: itemId, cartId: cart.id } });
    return this.view(userId);
  },

  async clear(userId: string) {
    const cart = await this.getOrCreate(userId);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: null } });
    return this.view(userId);
  },

  async applyCoupon(userId: string, code: string | null) {
    const cart = await this.getOrCreate(userId);
    if (code) {
      const subtotal = cart.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
      // Throws if invalid — validated before persisting.
      await couponsService.evaluate(code, userId, subtotal);
    }
    await prisma.cart.update({ where: { id: cart.id }, data: { couponCode: code?.toUpperCase() ?? null } });
    return this.view(userId);
  },
};
