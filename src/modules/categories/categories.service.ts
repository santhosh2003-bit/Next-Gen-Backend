import { prisma } from '../../common/prisma.js';
import { NotFoundError } from '../../common/errors.js';
import { uniqueSlug } from '../../common/slug.js';
import { cache } from '../../common/redis.js';
import { runBulk } from '../../common/bulk.js';
import type { z } from 'zod';
import type { createCategorySchema, updateCategorySchema } from './categories.schema.js';

export const categoriesService = {
  async list(includeInactive = false) {
    const load = () => prisma.category.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    return includeInactive ? load() : cache.getOrSet('catalog:categories', 300, load);
  },

  /** Build a nested category tree from the flat list. */
  async tree() {
    return cache.getOrSet('catalog:category-tree', 300, async () => {
    const all = await prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
    });
    type Node = (typeof all)[number] & { children: Node[] };
    const byId = new Map<string, Node>();
    all.forEach((c) => byId.set(c.id, { ...c, children: [] }));
    const roots: Node[] = [];
    byId.forEach((node) => {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
      else roots.push(node);
    });
    return roots;
    });
  },

  async getBySlug(slug: string) {
    const category = await prisma.category.findFirst({ where: { slug, deletedAt: null } });
    if (!category) throw new NotFoundError('Category not found');
    return category;
  },

  async create(input: z.infer<typeof createCategorySchema>) {
    const created = await prisma.category.create({
      data: { ...input, slug: uniqueSlug(input.name) },
    });
    await cache.invalidateNamespace('catalog');
    return created;
  },

  /** Bulk create — reuses `create` per item, capturing per-row results. */
  async createMany(items: z.infer<typeof createCategorySchema>[]) {
    return runBulk(items, (item) => this.create(item));
  },

  async update(id: string, input: z.infer<typeof updateCategorySchema>) {
    const existing = await prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Category not found');
    const updated = await prisma.category.update({ where: { id }, data: input });
    await cache.invalidateNamespace('catalog');
    return updated;
  },

  async remove(id: string) {
    const existing = await prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundError('Category not found');
    await prisma.category.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
    await cache.invalidateNamespace('catalog');
    return { success: true };
  },
};
