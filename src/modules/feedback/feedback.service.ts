import { prisma } from '../../common/prisma.js';
import { parsePagination } from '../../common/response.js';
import type { CreateFeedbackInput } from './feedback.schema.js';

export const feedbackService = {
  async create(input: CreateFeedbackInput, userId?: string | null) {
    return prisma.feedback.create({
      data: {
        userId: userId ?? null,
        message: input.message,
        rating: input.rating ?? null,
        category: input.category ?? null,
        name: input.name ?? null,
        email: input.email ?? null,
      },
    });
  },

  async list(query: { page?: unknown; pageSize?: unknown }) {
    const { skip, take, page, pageSize } = parsePagination(query);
    const [items, total] = await Promise.all([
      prisma.feedback.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.feedback.count(),
    ]);
    return { items, page, pageSize, total };
  },
};
