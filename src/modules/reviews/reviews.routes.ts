import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ok, paginated } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { reviewsService } from './reviews.service.js';

const createSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).optional(),
  body: z.string().max(2000).optional(),
});

const moderateSchema = z.object({ status: z.enum(['APPROVED', 'REJECTED']) });

export default async function reviewsRoutes(app: FastifyInstance) {
  // Public: reviews for a product.
  app.get('/product/:productId', async (req) => {
    const { productId } = req.params as { productId: string };
    const { items, page, pageSize, total } = await reviewsService.listForProduct(productId, req.query as never);
    return paginated(items, page, pageSize, total);
  });

  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const input = validate(createSchema, req.body);
    const review = await reviewsService.create(req.authUser!.id, input.productId, input.rating, input.title, input.body);
    return reply.status(201).send(ok(review));
  });

  app.delete('/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    return ok(await reviewsService.remove(req.authUser!.id, id, req.authUser!.roles.includes('admin')));
  });

  // Admin moderation.
  const guard = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('review:moderate')] };

  app.get('/pending', guard, async (req) => {
    const { items, page, pageSize, total } = await reviewsService.listPending(req.query as never);
    return paginated(items, page, pageSize, total);
  });

  app.patch('/:id/moderate', guard, async (req) => {
    const input = validate(moderateSchema, req.body);
    const { id } = req.params as { id: string };
    return ok(await reviewsService.moderate(id, input.status));
  });
}
