import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { brandsService } from './brands.service.js';
import { bulkCreateBrandSchema, createBrandSchema, updateBrandSchema } from './brands.schema.js';
import { recordAudit } from '../../common/audit.js';

export default async function brandsRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const { includeInactive } = req.query as { includeInactive?: string };
    return ok(await brandsService.list(includeInactive === 'true'));
  });

  app.get('/:slug', async (req) => {
    const { slug } = req.params as { slug: string };
    return ok(await brandsService.getBySlug(slug));
  });

  const guard = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('brand:write')] };

  app.post('/', guard, async (req, reply) => {
    const input = validate(createBrandSchema, req.body);
    return reply.status(201).send(ok(await brandsService.create(input)));
  });

  // Bulk create — one request stores all rows in the DB.
  app.post('/bulk', guard, async (req, reply) => {
    const { items } = validate(bulkCreateBrandSchema, req.body);
    const result = await brandsService.createMany(items);
    await recordAudit({
      userId: req.authUser!.id, action: 'brand.bulk_create', entity: 'brand',
      metadata: { count: items.length, created: result.created, failed: result.failed }, ipAddress: req.ip,
    });
    return reply.status(201).send(ok(result));
  });

  app.patch('/:id', guard, async (req) => {
    const input = validate(updateBrandSchema, req.body);
    const { id } = req.params as { id: string };
    return ok(await brandsService.update(id, input));
  });

  app.delete('/:id', guard, async (req) => {
    const { id } = req.params as { id: string };
    return ok(await brandsService.remove(id));
  });
}
