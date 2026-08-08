import type { FastifyInstance } from 'fastify';
import { ok, paginated } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { productRequestsService } from './product-requests.service.js';
import { createProductRequestSchema, updateRequestStatusSchema } from './product-requests.schema.js';

export default async function productRequestsRoutes(app: FastifyInstance) {
  // Customer submits a list of products they need. Auth optional (links user if signed in).
  app.post('/', { onRequest: [app.optionalAuth] }, async (req, reply) => {
    const input = validate(createProductRequestSchema, req.body);
    const created = await productRequestsService.create(input, req.authUser?.id ?? null);
    return reply.status(201).send(ok(created));
  });

  const admin = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('settings:write')] };

  // Admin: view requests to follow up and contact the customer directly.
  app.get('/', admin, async (req) => {
    const { items, page, pageSize, total } = await productRequestsService.list(req.query as Record<string, unknown>);
    return paginated(items, page, pageSize, total);
  });

  app.patch('/:id/status', admin, async (req) => {
    const { id } = req.params as { id: string };
    const { status } = validate(updateRequestStatusSchema, req.body);
    return ok(await productRequestsService.setStatus(id, status));
  });
}
