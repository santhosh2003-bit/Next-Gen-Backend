import { prisma } from '../../common/prisma.js';
import { BadRequestError, NotFoundError } from '../../common/errors.js';
import { parsePagination } from '../../common/response.js';

/** Recompute a product's rating aggregate from APPROVED reviews. */
async function recomputeRating(productId: string) {
  const agg = await prisma.review.aggregate({
    where: { productId, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await prisma.product.update({
    where: { id: productId },
    data: {
      ratingAvg: Math.round((agg._avg.rating ?? 0) * 100) / 100,
      ratingCount: agg._count._all,
    },
  });
}

export const reviewsService = {
  async listForProduct(productId: string, query: { page?: unknown; pageSize?: unknown }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where = { productId, status: 'APPROVED' as const };
    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { firstName: true, lastName: true } } },
      }),
      prisma.review.count({ where }),
    ]);
    return { items, page, pageSize, total };
  },

  /** A user may only review a product they have purchased & received. */
  async create(userId: string, productId: string, rating: number, title?: string, body?: string) {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Product not found');

    const purchased = await prisma.orderItem.findFirst({
      where: { productId, order: { userId, status: { in: ['DELIVERED', 'CONFIRMED', 'SHIPPED'] } } },
    });
    if (!purchased) throw new BadRequestError('You can only review products you have purchased');

    const review = await prisma.review.upsert({
      where: { productId_userId: { productId, userId } },
      create: { productId, userId, rating, title, body, status: 'PENDING' },
      update: { rating, title, body, status: 'PENDING' },
    });
    return review;
  },

  async moderate(reviewId: string, status: 'APPROVED' | 'REJECTED') {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundError('Review not found');
    const updated = await prisma.review.update({ where: { id: reviewId }, data: { status } });
    await recomputeRating(review.productId);
    return updated;
  },

  async listPending(query: { page?: unknown; pageSize?: unknown }) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where = { status: 'PENDING' as const };
    const [items, total] = await Promise.all([
      prisma.review.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'asc' },
        include: { product: { select: { name: true } }, user: { select: { email: true } } },
      }),
      prisma.review.count({ where }),
    ]);
    return { items, page, pageSize, total };
  },

  async remove(userId: string, reviewId: string, isAdmin: boolean) {
    const review = await prisma.review.findUnique({ where: { id: reviewId } });
    if (!review) throw new NotFoundError('Review not found');
    if (!isAdmin && review.userId !== userId) throw new BadRequestError('Not your review');
    await prisma.review.delete({ where: { id: reviewId } });
    await recomputeRating(review.productId);
    return { success: true };
  },
};
