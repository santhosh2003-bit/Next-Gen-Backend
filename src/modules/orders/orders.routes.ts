import type { FastifyInstance } from 'fastify';
import { ok, paginated } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { ordersService } from './orders.service.js';
import { listOrdersQuery, updateStatusSchema } from './orders.schema.js';

export default async function ordersRoutes(app: FastifyInstance) {
  // ── Customer ──────────────────────────────────────────
  app.get('/', { onRequest: [app.authenticate] }, async (req) => {
    const query = validate(listOrdersQuery, req.query);
    const { items, page, pageSize, total } = await ordersService.listForUser(req.authUser!.id, query);
    return paginated(items, page, pageSize, total);
  });

  app.get('/:id', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    const isAdmin = req.authUser!.roles.includes('admin');
    return ok(await ordersService.getForUser(req.authUser!.id, id, isAdmin));
  });

  app.post('/:id/cancel', { onRequest: [app.authenticate] }, async (req) => {
    const { id } = req.params as { id: string };
    // Ensure ownership before cancelling.
    await ordersService.getForUser(req.authUser!.id, id, req.authUser!.roles.includes('admin'));
    return ok(await ordersService.updateStatus(id, 'CANCELLED', { note: 'Cancelled by customer' }));
  });

  // ── Admin ─────────────────────────────────────────────
  const adminGuard = {
    onRequest: [app.authenticate],
    preHandler: [app.requirePermissions('order:manage')],
  };

  app.get('/admin/all', adminGuard, async (req) => {
    const query = validate(listOrdersQuery, req.query);
    const { items, page, pageSize, total } = await ordersService.listAll(query);
    return paginated(items, page, pageSize, total);
  });

  app.patch('/:id/status', adminGuard, async (req) => {
    const input = validate(updateStatusSchema, req.body);
    const { id } = req.params as { id: string };
    return ok(
      await ordersService.updateStatus(id, input.status, {
        note: input.note,
        expectedDeliveryAt: input.expectedDeliveryAt,
      }),
    );
  });
}
