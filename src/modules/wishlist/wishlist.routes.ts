import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../common/prisma.js';
import { NotFoundError } from '../../common/errors.js';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';

const addSchema = z.object({ productId: z.string().uuid() });

export default async function wishlistRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => {
    const items = await prisma.wishlistItem.findMany({
      where: { userId: req.authUser!.id },
      include: {
        product: {
          include: { images: { where: { isPrimary: true }, take: 1 }, brand: { select: { name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return ok(items);
  });

  app.post('/', async (req, reply) => {
    const input = validate(addSchema, req.body);
    const product = await prisma.product.findFirst({ where: { id: input.productId, deletedAt: null } });
    if (!product) throw new NotFoundError('Product not found');
    const item = await prisma.wishlistItem.upsert({
      where: { userId_productId: { userId: req.authUser!.id, productId: input.productId } },
      create: { userId: req.authUser!.id, productId: input.productId },
      update: {},
    });
    return reply.status(201).send(ok(item));
  });

  app.delete('/:productId', async (req) => {
    const { productId } = req.params as { productId: string };
    await prisma.wishlistItem.deleteMany({ where: { userId: req.authUser!.id, productId } });
    return ok({ success: true });
  });
}
