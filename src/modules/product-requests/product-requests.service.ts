import { prisma } from '../../common/prisma.js';
import { parsePagination } from '../../common/response.js';
import { NotFoundError } from '../../common/errors.js';
import type { CreateProductRequestInput } from './product-requests.schema.js';

export const productRequestsService = {
  async create(input: CreateProductRequestInput, userId?: string | null) {
    return prisma.productRequest.create({
      data: {
        userId: userId ?? null,
        phone: input.phone,
        items: input.items,
        name: input.name ?? null,
        email: input.email || null,
        note: input.note ?? null,
      },
    });
  },

  async list(query: { page?: unknown; pageSize?: unknown; status?: string }) {
    const { skip, take, page, pageSize } = parsePagination(query);
    const where = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      prisma.productRequest.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.productRequest.count({ where }),
    ]);
    return { items, page, pageSize, total };
  },

  async setStatus(id: string, status: string) {
    const existing = await prisma.productRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Request not found');
    return prisma.productRequest.update({ where: { id }, data: { status } });
  },
};
