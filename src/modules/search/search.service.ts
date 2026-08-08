import { Prisma } from '@prisma/client';
import { prisma } from '../../common/prisma.js';
import { parsePagination } from '../../common/response.js';
import { cache } from '../../common/redis.js';

const listInclude = {
  images: { where: { isPrimary: true }, take: 1 },
  brand: { select: { name: true, slug: true } },
  category: { select: { name: true, slug: true } },
} satisfies Prisma.ProductInclude;

export const searchService = {
  /**
   * Keyword search with relevance ranking. Uses ILIKE across name/description
   * plus a simple scoring (name match > description match) and rating boost.
   * Swap in pgvector / tsvector here for true semantic search.
   */
  async search(q: string, query: { page?: unknown; pageSize?: unknown; categoryId?: string }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const term = q.trim();
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(term
        ? {
            OR: [
              { name: { contains: term, mode: 'insensitive' } },
              { shortDescription: { contains: term, mode: 'insensitive' } },
              { description: { contains: term, mode: 'insensitive' } },
              { sku: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: listInclude,
        skip,
        take,
        orderBy: [{ ratingAvg: 'desc' }, { ratingCount: 'desc' }],
      }),
      prisma.product.count({ where }),
    ]);

    // Lightweight relevance re-rank in memory for the current page.
    const scored = items
      .map((p) => {
        const name = p.name.toLowerCase();
        const t = term.toLowerCase();
        let score = Number(p.ratingAvg);
        if (t && name.includes(t)) score += 5;
        if (t && name.startsWith(t)) score += 3;
        return { p, score };
      })
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);

    return { items: scored, page, pageSize, total };
  },

  /** Autocomplete suggestions (names + categories + brands). */
  async suggest(q: string) {
    const term = q.trim();
    if (!term) return { products: [], categories: [], brands: [] };
    return cache.getOrSet(`catalog:suggest:${term.toLowerCase()}`, 45, async () => {
    const [products, categories, brands] = await Promise.all([
      prisma.product.findMany({
        where: { deletedAt: null, status: 'ACTIVE', name: { contains: term, mode: 'insensitive' } },
        select: { name: true, slug: true },
        take: 5,
      }),
      prisma.category.findMany({
        where: { isActive: true, deletedAt: null, name: { contains: term, mode: 'insensitive' } },
        select: { name: true, slug: true },
        take: 3,
      }),
      prisma.brand.findMany({
        where: { isActive: true, deletedAt: null, name: { contains: term, mode: 'insensitive' } },
        select: { name: true, slug: true },
        take: 3,
      }),
    ]);
    return { products, categories, brands };
    });
  },

  /** "Customers also viewed" — same category, excluding the product itself. */
  async related(productId: string) {
    return cache.getOrSet(`catalog:related:${productId}`, 120, async () => {
      const product = await prisma.product.findUnique({ where: { id: productId } });
      if (!product) return [];
      return prisma.product.findMany({
      where: {
        deletedAt: null,
        status: 'ACTIVE',
        categoryId: product.categoryId,
        id: { not: productId },
      },
      include: listInclude,
      orderBy: { ratingAvg: 'desc' },
      take: 10,
      });
    });
  },

  /**
   * Personalized recommendations. Blends the user's recently ordered
   * categories with globally trending (top rated / most sold) products.
   */
  async recommendations(userId?: string) {
    if (userId) {
      const recentItems = await prisma.orderItem.findMany({
        where: { order: { userId } },
        select: { product: { select: { categoryId: true } } },
        take: 20,
        orderBy: { id: 'desc' },
      });
      const categoryIds = [...new Set(recentItems.map((i) => i.product.categoryId))];
      if (categoryIds.length) {
        const recs = await prisma.product.findMany({
          where: { deletedAt: null, status: 'ACTIVE', categoryId: { in: categoryIds } },
          include: listInclude,
          orderBy: { ratingAvg: 'desc' },
          take: 12,
        });
        if (recs.length) return recs;
      }
    }
    return this.trending();
  },

  async trending() {
    return cache.getOrSet('catalog:trending', 120, () => prisma.product.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: listInclude,
      orderBy: [{ ratingCount: 'desc' }, { ratingAvg: 'desc' }],
      take: 12,
    }));
  },
};
