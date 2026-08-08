import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { recordAudit } from '../../common/audit.js';
import { advertisementsService } from './advertisements.service.js';
import { createAdSchema, updateAdSchema } from './advertisements.schema.js';

export default async function advertisementsRoutes(app: FastifyInstance) {
  // Public: active banners the storefront shows to customers.
  app.get('/', async () => ok(await advertisementsService.listActive()));

  const write = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('settings:write')] };

  // Admin: manage every banner (any status).
  app.get('/admin/all', write, async () => ok(await advertisementsService.listAll()));

  app.post('/', write, async (req, reply) => {
    const input = validate(createAdSchema, req.body);
    const ad = await advertisementsService.create(input);
    await recordAudit({ userId: req.authUser!.id, action: 'ad.create', entity: 'advertisement', entityId: ad.id, ipAddress: req.ip });
    return reply.status(201).send(ok(ad));
  });

  app.patch('/:id', write, async (req) => {
    const input = validate(updateAdSchema, req.body);
    const { id } = req.params as { id: string };
    const ad = await advertisementsService.update(id, input);
    await recordAudit({ userId: req.authUser!.id, action: 'ad.update', entity: 'advertisement', entityId: id, ipAddress: req.ip });
    return ok(ad);
  });

  app.delete('/:id', write, async (req) => {
    const { id } = req.params as { id: string };
    const result = await advertisementsService.remove(id);
    await recordAudit({ userId: req.authUser!.id, action: 'ad.delete', entity: 'advertisement', entityId: id, ipAddress: req.ip });
    return ok(result);
  });
}
