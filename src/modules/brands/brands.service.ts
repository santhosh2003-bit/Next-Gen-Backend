import { prisma } from '../../common/prisma.js';
import { NotFoundError } from '../../common/errors.js';
import { uniqueSlug } from '../../common/slug.js';
import { cache } from '../../common/redis.js';
import type { z } from 'zod';
import type { createBrandSchema, updateBrandSchema } from './brands.schema.js';

export const brandsService = {
  async list(includeInactive = false) {
    const load = () => prisma.brand.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    return includeInactive ? load() : cache.getOrSet('catalog:brands', 300, load);
  },

  async getBySlug(slug: string) {
    const brand = await prisma.brand.findFirst({ where: { slug, deletedAt: null } });
    if (!brand) throw new NotFoundError('Brand not found');
    return brand;
  },

  async create(input: z.infer<typeof createBrandSchema>) {
    const created = await prisma.brand.create({ data: { ...input, slug: uniqueSlug(input.name) } });
    await cache.invalidateNamespace('catalog');
    return created;
  },

  async update(id: string, input: z.infer<typeof updateBrandSchema>) {
    const existing = await prisma.brand.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Brand not found');
    const updated = await prisma.brand.update({ where: { id }, data: input });
    await cache.invalidateNamespace('catalog');
    return updated;
  },

  async remove(id: string) {
    const existing = await prisma.brand.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Brand not found');
    await prisma.brand.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await cache.invalidateNamespace('catalog');
    return { success: true };
  },
};
