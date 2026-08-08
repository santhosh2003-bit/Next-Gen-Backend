import { customAlphabet } from 'nanoid';
import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../common/errors.js';
import { parsePagination } from '../../common/response.js';
import { inventoryService } from '../inventory/inventory.service.js';
import { enqueueNotification } from '../../common/queue.js';
import { cache } from '../../common/redis.js';
import type { z } from 'zod';
import type { listOrdersQuery } from './orders.schema.js';

const orderNo = customAlphabet('0123456789', 10);

const orderInclude = {
  items: true,
  payments: { orderBy: { createdAt: 'desc' as const } },
  address: true,
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
};

/** Allowed forward transitions for order lifecycle. */
const TRANSITIONS: Record<string, string[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PACKED', 'CANCELLED'],
  PACKED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'RETURNED'],
  DELIVERED: ['RETURNED'],
  RETURNED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

export const ordersService = {
  generateOrderNumber() {
    return `NG-${orderNo()}`;
  },

  async listForUser(userId: string, query: z.infer<typeof listOrdersQuery>) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where = { userId, ...(query.status ? { status: query.status } : {}) };
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, skip, take, orderBy: { placedAt: 'desc' } }),
      prisma.order.count({ where }),
    ]);
    return { items, page, pageSize, total };
  },

  async listAll(query: z.infer<typeof listOrdersQuery>) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      prisma.order.findMany({ where, include: orderInclude, skip, take, orderBy: { placedAt: 'desc' } }),
      prisma.order.count({ where }),
    ]);
    return { items, page, pageSize, total };
  },

  async getForUser(userId: string, id: string, isAdmin = false) {
    const order = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!order) throw new NotFoundError('Order not found');
    if (!isAdmin && order.userId !== userId) throw new ForbiddenError('Not your order');
    return order;
  },

  async updateStatus(
    id: string,
    status: string,
    opts: { note?: string; expectedDeliveryAt?: string | null } = {},
  ) {
    const order = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundError('Order not found');

    const statusChanged = order.status !== status;
    if (statusChanged) {
      const allowed = TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(status)) {
        throw new BadRequestError(`Cannot transition from ${order.status} to ${status}`);
      }
    }

    // Build the delivery-date patch (undefined = leave unchanged, null = clear).
    const deliveryPatch =
      opts.expectedDeliveryAt !== undefined
        ? { expectedDeliveryAt: opts.expectedDeliveryAt ? new Date(opts.expectedDeliveryAt) : null }
        : {};

    const updated = await prisma.$transaction(async (tx) => {
      if (statusChanged && status === 'CANCELLED') {
        await inventoryService.releaseReservation(
          tx,
          order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
          `order:${order.orderNumber}:cancel`,
        );
      }
      const o = await tx.order.update({
        where: { id },
        data: {
          ...(statusChanged ? { status: status as never } : {}),
          ...deliveryPatch,
          ...(statusChanged && status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
          ...(statusChanged && status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
        include: orderInclude,
      });
      if (statusChanged || opts.note) {
        await tx.orderStatusHistory.create({ data: { orderId: id, status: status as never, note: opts.note } });
      }
      return o;
    });
    if (statusChanged && status === 'CANCELLED') await cache.invalidateNamespace('catalog');

    // Notify the customer of a status change or a newly-set delivery date.
    const eta = (updated as { expectedDeliveryAt?: Date | null }).expectedDeliveryAt;
    const body = statusChanged
      ? `Your order ${order.orderNumber} is now ${status}.${eta ? ` Expected delivery: ${eta.toLocaleString()}.` : ''}`
      : `Delivery for order ${order.orderNumber} is scheduled for ${eta ? eta.toLocaleString() : 'soon'}.`;
    await enqueueNotification({
      userId: order.userId,
      channel: 'PUSH',
      title: 'Order update',
      body,
      data: { orderId: id, status },
    }).catch(() => undefined);

    return updated;
  },

  /**
   * Mark an order confirmed after payment capture, committing the reserved
   * stock into an actual decrement. Used by the payment webhook/verify flow.
   */
  async confirmPaid(tx: Prisma.TransactionClient, orderId: string) {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) throw new NotFoundError('Order not found');
    if (order.status !== 'PENDING') return order;

    await inventoryService.commitReservation(
      tx,
      order.items.map((i) => ({ productId: i.productId, variantId: i.variantId, quantity: i.quantity })),
      `order:${order.orderNumber}:paid`,
    );
    const updated = await tx.order.update({ where: { id: orderId }, data: { status: 'CONFIRMED' } });
    await tx.orderStatusHistory.create({
      data: { orderId, status: 'CONFIRMED', note: 'Payment captured' },
    });
    return updated;
  },
};
