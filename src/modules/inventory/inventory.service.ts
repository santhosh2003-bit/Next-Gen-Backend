import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { cache } from '../../common/redis.js';
import type { z } from 'zod';
import type {
  adjustStockSchema,
  createWarehouseSchema,
  upsertInventorySchema,
} from './inventory.schema.js';

/** Available = quantity - reserved. Used everywhere stock is checked. */
export const availableQty = (i: { quantity: number; reserved: number }) => i.quantity - i.reserved;

export const inventoryService = {
  // ── Warehouses ─────────────────────────────────────────
  async listWarehouses() {
    return prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
  },

  async createWarehouse(input: z.infer<typeof createWarehouseSchema>) {
    return prisma.warehouse.create({ data: input });
  },

  /** Return the first warehouse, creating a default one if none exist yet. */
  async getOrCreateDefaultWarehouse() {
    const existing = await prisma.warehouse.findFirst({ orderBy: { name: 'asc' } });
    if (existing) return existing;
    return prisma.warehouse.create({ data: { name: 'Main Warehouse', code: 'MAIN', isActive: true } });
  },

  /** Set a product's absolute stock (and optional reorder level) in the default warehouse. */
  async setProductStock(productId: string, quantity: number, reorderLevel?: number) {
    const warehouse = await this.getOrCreateDefaultWarehouse();
    return this.upsert({ productId, variantId: null, warehouseId: warehouse.id, quantity, reorderLevel });
  },

  /** Set only the low-stock reorder level, without changing quantity. */
  async setReorderLevel(productId: string, reorderLevel: number) {
    const warehouse = await this.getOrCreateDefaultWarehouse();
    const existing = await prisma.inventory.findFirst({
      where: { productId, variantId: null, warehouseId: warehouse.id },
    });
    if (existing) {
      await prisma.inventory.update({ where: { id: existing.id }, data: { reorderLevel } });
    } else {
      await prisma.inventory.create({
        data: { productId, variantId: null, warehouseId: warehouse.id, quantity: 0, reorderLevel },
      });
    }
    await cache.invalidateNamespace('catalog');
  },

  /** Add (or remove, with a negative amount) stock in the default warehouse. */
  async addProductStock(productId: string, amount: number) {
    const warehouse = await this.getOrCreateDefaultWarehouse();
    const existing = await prisma.inventory.findFirst({
      where: { productId, variantId: null, warehouseId: warehouse.id },
    });
    if (!existing) {
      return this.upsert({ productId, variantId: null, warehouseId: warehouse.id, quantity: Math.max(0, amount) });
    }
    return this.adjust({ productId, variantId: null, warehouseId: warehouse.id, delta: amount, reference: 'restock' });
  },

  // ── Stock levels ───────────────────────────────────────
  async getForProduct(productId: string) {
    return prisma.inventory.findMany({
      where: { productId },
      include: { warehouse: { select: { id: true, name: true, code: true } } },
    });
  },

  /** Aggregate available quantity across all warehouses for a product/variant. */
  async availableForProduct(productId: string, variantId?: string | null) {
    const rows = await prisma.inventory.findMany({
      where: { productId, variantId: variantId ?? null },
    });
    return rows.reduce((sum, r) => sum + availableQty(r), 0);
  },

  async upsert(input: z.infer<typeof upsertInventorySchema>) {
    // Nullable variantId can't be used in Prisma's compound-unique input,
    // so we look up with findFirst then create/update explicitly.
    const existing = await prisma.inventory.findFirst({
      where: {
        productId: input.productId,
        variantId: input.variantId ?? null,
        warehouseId: input.warehouseId,
      },
    });
    const record = existing
      ? await prisma.inventory.update({
          where: { id: existing.id },
          data: {
            quantity: input.quantity,
            ...(input.reorderLevel != null ? { reorderLevel: input.reorderLevel } : {}),
          },
        })
      : await prisma.inventory.create({
          data: {
            productId: input.productId,
            variantId: input.variantId ?? null,
            warehouseId: input.warehouseId,
            quantity: input.quantity,
            reorderLevel: input.reorderLevel ?? 0,
          },
        });
    await prisma.stockMovement.create({
      data: {
        inventoryId: record.id,
        productId: input.productId,
        type: 'ADJUSTMENT',
        quantity: input.quantity,
        reference: 'manual upsert',
      },
    });
    await cache.invalidateNamespace('catalog');
    return record;
  },

  async adjust(input: z.infer<typeof adjustStockSchema>) {
    const inv = await prisma.inventory.findFirst({
      where: {
        productId: input.productId,
        variantId: input.variantId ?? null,
        warehouseId: input.warehouseId,
      },
    });
    if (!inv) throw new NotFoundError('Inventory record not found');
    if (inv.quantity + input.delta < 0) throw new BadRequestError('Adjustment would make stock negative');

    const updated = await prisma.inventory.update({
      where: { id: inv.id },
      data: { quantity: { increment: input.delta } },
    });
    await prisma.stockMovement.create({
      data: {
        inventoryId: inv.id,
        productId: input.productId,
        type: input.delta >= 0 ? 'INBOUND' : 'OUTBOUND',
        quantity: Math.abs(input.delta),
        reference: input.reference ?? 'manual adjust',
      },
    });
    await cache.invalidateNamespace('catalog');
    return updated;
  },

  /**
   * Reserve stock for a set of order lines within a transaction.
   * Picks warehouses greedily until each line is satisfied.
   * Throws if any line cannot be fully reserved.
   */
  async reserve(
    tx: Prisma.TransactionClient,
    lines: { productId: string; variantId?: string | null; quantity: number }[],
    reference: string,
  ) {
    for (const line of lines) {
      let remaining = line.quantity;
      const rows = await tx.inventory.findMany({
        where: { productId: line.productId, variantId: line.variantId ?? null },
        orderBy: { quantity: 'desc' },
      });
      const totalAvailable = rows.reduce((s, r) => s + availableQty(r), 0);
      if (totalAvailable < remaining) {
        throw new BadRequestError(`Insufficient stock for product ${line.productId}`);
      }
      for (const row of rows) {
        if (remaining <= 0) break;
        const take = Math.min(availableQty(row), remaining);
        if (take <= 0) continue;
        await tx.inventory.update({ where: { id: row.id }, data: { reserved: { increment: take } } });
        await tx.stockMovement.create({
          data: { inventoryId: row.id, productId: line.productId, type: 'RESERVE', quantity: take, reference },
        });
        remaining -= take;
      }
    }
  },

  /** Convert reservation into an actual outbound decrement (on payment capture). */
  async commitReservation(
    tx: Prisma.TransactionClient,
    lines: { productId: string; variantId?: string | null; quantity: number }[],
    reference: string,
  ) {
    for (const line of lines) {
      let remaining = line.quantity;
      const rows = await tx.inventory.findMany({
        where: { productId: line.productId, variantId: line.variantId ?? null, reserved: { gt: 0 } },
        orderBy: { reserved: 'desc' },
      });
      for (const row of rows) {
        if (remaining <= 0) break;
        const take = Math.min(row.reserved, remaining);
        await tx.inventory.update({
          where: { id: row.id },
          data: { reserved: { decrement: take }, quantity: { decrement: take } },
        });
        await tx.stockMovement.create({
          data: { inventoryId: row.id, productId: line.productId, type: 'OUTBOUND', quantity: take, reference },
        });
        remaining -= take;
      }
    }
  },

  /** Release a reservation (order cancelled / payment failed). */
  async releaseReservation(
    tx: Prisma.TransactionClient,
    lines: { productId: string; variantId?: string | null; quantity: number }[],
    reference: string,
  ) {
    for (const line of lines) {
      let remaining = line.quantity;
      const rows = await tx.inventory.findMany({
        where: { productId: line.productId, variantId: line.variantId ?? null, reserved: { gt: 0 } },
        orderBy: { reserved: 'desc' },
      });
      for (const row of rows) {
        if (remaining <= 0) break;
        const give = Math.min(row.reserved, remaining);
        await tx.inventory.update({ where: { id: row.id }, data: { reserved: { decrement: give } } });
        await tx.stockMovement.create({
          data: { inventoryId: row.id, productId: line.productId, type: 'RELEASE', quantity: give, reference },
        });
        remaining -= give;
      }
    }
  },

  async lowStock() {
    const rows = await prisma.inventory.findMany({
      where: { reorderLevel: { gt: 0 } },
      include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } },
    });
    return rows.filter((r) => availableQty(r) <= r.reorderLevel);
  },
};
