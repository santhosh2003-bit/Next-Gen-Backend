import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { categoriesService } from './categories.service.js';
import { createCategorySchema, updateCategorySchema } from './categories.schema.js';

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
