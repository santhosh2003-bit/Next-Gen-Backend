import { Prisma } from "@prisma/client";
import { prisma } from "../../common/prisma.js";
import { NotFoundError } from "../../common/errors.js";
import { parsePagination } from "../../common/response.js";
import { uniqueSlug } from "../../common/slug.js";
import { cache } from '../../common/redis.js';
import { deleteFromCloudinary } from '../../common/cloudinary.js';
import { runBulk } from '../../common/bulk.js';
import { inventoryService } from '../inventory/inventory.service.js';
import type { z } from "zod";
import type {
  createProductSchema,
  listProductsQuery,
  updateProductSchema,
} from "./products.schema.js";

const productInclude = {
  images: { orderBy: { position: "asc" } },
  variants: true,
  inventory: { select: { quantity: true, reserved: true, warehouseId: true, reorderLevel: true } },
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

function orderBy(sort?: string): Prisma.ProductOrderByWithRelationInput {
  switch (sort) {
    case "price_asc":
      return { price: "asc" };
    case "price_desc":
      return { price: "desc" };
    case "rating":
      return { ratingAvg: "desc" };
    case "name":
      return { name: "asc" };
    default:
      return { createdAt: "desc" };
  }
}

export const productsService = {
  async list(
    query: z.infer<typeof listProductsQuery>,
    opts: { onlyActive?: boolean } = {},
  ) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(opts.onlyActive
        ? { status: "ACTIVE" }
        : query.status
          ? { status: query.status }
          : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.minPrice != null || query.maxPrice != null
        ? {
            price: {
              gte: query.minPrice ?? undefined,
              lte: query.maxPrice ?? undefined,
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { sku: { contains: query.search, mode: "insensitive" } },
              {
                shortDescription: {
                  contains: query.search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const load = async () => {
      const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: productInclude,
        skip,
        take,
        orderBy: orderBy(query.sort),
      }),
      prisma.product.count({ where }),
      ]);
      return { items, page, pageSize, total };
    };

    // Admin views are permission-specific and intentionally never shared in cache.
    if (!opts.onlyActive) return load();
    return cache.getOrSet(`catalog:products:${JSON.stringify(query)}`, 60, load);
  },

  async getBySlug(slug: string) {
    return cache.getOrSet(`catalog:product:${slug}`, 120, async () => {
      const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null },
      include: {
        ...productInclude,
        reviews: {
          where: { status: "APPROVED" },
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { user: { select: { firstName: true, lastName: true } } },
        },
        inventory: {
          select: { quantity: true, reserved: true, warehouseId: true },
        },
      },
    });
      if (!product) throw new NotFoundError("Product not found");
      return product;
    });
  },

  async getById(id: string) {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: productInclude,
    });
    if (!product) throw new NotFoundError("Product not found");
    return product;
  },

  async create(input: z.infer<typeof createProductSchema>) {
    const { images, variants, stock, lowStockThreshold, ...rest } = input;
    const created = await prisma.product.create({
      data: {
        ...rest,
        slug: uniqueSlug(input.name),
        images: images?.length ? { create: images } : undefined,
        variants: variants?.length ? { create: variants } : undefined,
      },
      include: productInclude,
    });
    // Stock + low-stock threshold live in Inventory, not on the product.
    if (stock != null) await inventoryService.setProductStock(created.id, stock, lowStockThreshold);
    else if (lowStockThreshold != null) await inventoryService.setReorderLevel(created.id, lowStockThreshold);
    await cache.invalidateNamespace('catalog');
    return stock != null || lowStockThreshold != null ? this.getById(created.id) : created;
  },

  /** Add stock to a product's default-warehouse inventory (restock). */
  async addStock(id: string, amount: number) {
    await this.getById(id);
    await inventoryService.addProductStock(id, amount);
    return this.getById(id);
  },

  /** Bulk create — reuses `create` per item, capturing per-row results. */
  async createMany(items: z.infer<typeof createProductSchema>[]) {
    return runBulk(items, (item) => this.create(item));
  },

  async update(id: string, input: z.infer<typeof updateProductSchema>) {
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Product not found");
    const { stock, lowStockThreshold, ...rest } = input;
    const updated = await prisma.product.update({
      where: { id },
      data: rest,
      include: productInclude,
    });
    if (stock != null) await inventoryService.setProductStock(id, stock, lowStockThreshold);
    else if (lowStockThreshold != null) await inventoryService.setReorderLevel(id, lowStockThreshold);
    await cache.invalidateNamespace('catalog');
    return stock != null || lowStockThreshold != null ? this.getById(id) : updated;
  },

  async remove(id: string) {
    const existing = await prisma.product.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) throw new NotFoundError("Product not found");
    await prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), status: "ARCHIVED" },
    });
    await cache.invalidateNamespace('catalog');
    return { success: true };
  },

  // ── Images ─────────────────────────────────────────────
  async addImage(
    productId: string,
    image: z.infer<typeof import("./products.schema.js").productImageSchema>,
  ) {
    await this.getById(productId);
    const created = await prisma.$transaction(async (tx) => {
      const count = await tx.productImage.count({ where: { productId } });
      const isPrimary = image.isPrimary || count === 0;
      if (isPrimary) {
        await tx.productImage.updateMany({ where: { productId }, data: { isPrimary: false } });
      }
      return tx.productImage.create({ data: { ...image, productId, isPrimary } });
    });
    await cache.invalidateNamespace('catalog');
    return created;
  },

  async removeImage(productId: string, imageId: string) {
    const row = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!row) return { success: true };

    // Delete the remote file in Cloudinary first, then the DB row.
    await deleteFromCloudinary(row.publicId);

    await prisma.$transaction(async (tx) => {
      await tx.productImage.delete({ where: { id: row.id } });
      const primary = await tx.productImage.findFirst({ where: { productId, isPrimary: true } });
      if (!primary) {
        const fallback = await tx.productImage.findFirst({ where: { productId }, orderBy: { position: 'asc' } });
        if (fallback) await tx.productImage.update({ where: { id: fallback.id }, data: { isPrimary: true } });
      }
    });
    await cache.invalidateNamespace('catalog');
    return { success: true };
  },

  async replaceImage(
    productId: string,
    imageId: string,
    next: z.infer<typeof import("./products.schema.js").productImageSchema>,
  ) {
    const old = await prisma.productImage.findFirst({ where: { id: imageId, productId } });
    if (!old) throw new NotFoundError("Image not found");

    // Remove the old Cloudinary file first, then point the row at the new one.
    if (old.publicId && old.publicId !== next.publicId) {
      await deleteFromCloudinary(old.publicId);
    }

    const updated = await prisma.productImage.update({
      where: { id: old.id },
      data: {
        url: next.url,
        publicId: next.publicId ?? null,
        alt: next.alt ?? old.alt,
      },
    });
    await cache.invalidateNamespace('catalog');
    return updated;
  },

  // ── Variants ───────────────────────────────────────────
  async addVariant(
    productId: string,
    variant: z.infer<
      typeof import("./products.schema.js").productVariantSchema
    >,
  ) {
    await this.getById(productId);
    return prisma.productVariant.create({ data: { ...variant, productId } });
  },

  async removeVariant(productId: string, variantId: string) {
    await prisma.productVariant.deleteMany({
      where: { id: variantId, productId },
    });
    return { success: true };
  },
};
