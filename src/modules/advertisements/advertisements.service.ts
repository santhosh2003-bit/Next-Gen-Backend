import { prisma } from '../../common/prisma.js';
import { NotFoundError } from '../../common/errors.js';
import type { CreateAdInput, UpdateAdInput } from './advertisements.schema.js';

/** Coerce shared string fields (blank image, ISO dates) for Prisma writes. */
function dateFields(input: CreateAdInput | UpdateAdInput) {
  return {
    imageUrl: input.imageUrl === '' ? null : input.imageUrl,
    startsAt: input.startsAt ? new Date(input.startsAt) : input.startsAt === null ? null : undefined,
    endsAt: input.endsAt ? new Date(input.endsAt) : input.endsAt === null ? null : undefined,
  };
}

export const advertisementsService = {
  /** Active ads currently within their schedule window, ordered for display. */
  async listActive() {
    const now = new Date();
    return prisma.advertisement.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    });
  },

  /** All ads, for the admin manager. */
  async listAll() {
    return prisma.advertisement.findMany({ orderBy: [{ position: 'asc' }, { createdAt: 'desc' }] });
  },

  async create(input: CreateAdInput) {
    return prisma.advertisement.create({ data: { ...input, ...dateFields(input) } });
  },

  async update(id: string, input: UpdateAdInput) {
    const existing = await prisma.advertisement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Advertisement not found');
    return prisma.advertisement.update({ where: { id }, data: { ...input, ...dateFields(input) } });
  },

  async remove(id: string) {
    const existing = await prisma.advertisement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Advertisement not found');
    await prisma.advertisement.delete({ where: { id } });
    return { success: true };
  },
};
