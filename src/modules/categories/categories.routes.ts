import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { categoriesService } from './categories.service.js';
import { bulkCreateCategorySchema, createCategorySchema, updateCategorySchema } from './categories.schema.js';
import { recordAudit } from '../../common/audit.js';

export default async function categoriesRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const { includeInactive } = req.query as { includeInactive?: string };
    return ok(await categoriesService.list(includeInactive === 'true'));
  });

  app.get('/tree', async () => ok(await categoriesService.tree()));

  app.get('/:slug', async (req) => {
    const { slug } = req.params as { slug: string };
    return ok(await categoriesService.getBySlug(slug));
  });

  const guard = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('category:write')] };

  app.post('/', guard, async (req, reply) => {
    const input = validate(createCategorySchema, req.body);
    return reply.status(201).send(ok(await categoriesService.create(input)));
  });

  // Bulk create — one request stores all rows in the DB.
  app.post('/bulk', guard, async (req, reply) => {
    const { items } = validate(bulkCreateCategorySchema, req.body);
    const result = await categoriesService.createMany(items);
    await recordAudit({
      userId: req.authUser!.id, action: 'category.bulk_create', entity: 'category',
      metadata: { count: items.length, created: result.created, failed: result.failed }, ipAddress: req.ip,
    });
    return reply.status(201).send(ok(result));
  });

  app.patch('/:id', guard, async (req) => {
    const input = validate(updateCategorySchema, req.body);
    const { id } = req.params as { id: string };
    return ok(await categoriesService.update(id, input));
  });

  app.delete('/:id', guard, async (req) => {
    const { id } = req.params as { id: string };
    return ok(await categoriesService.remove(id));
  });
}
