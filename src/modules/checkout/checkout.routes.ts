import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { recordAudit } from '../../common/audit.js';
import { checkoutService } from './checkout.service.js';
import { checkoutSchema } from './checkout.schema.js';

export default async function checkoutRoutes(app: FastifyInstance) {
  app.post('/', { onRequest: [app.authenticate] }, async (req, reply) => {
    const input = validate(checkoutSchema, req.body);
    const result = await checkoutService.placeOrder(req.authUser!.id, input);
    await recordAudit({
      userId: req.authUser!.id,
      action: 'checkout.place_order',
      entity: 'order',
      entityId: result.order.id,
      ipAddress: req.ip,
    });
    return reply.status(201).send(ok(result));
  });
}
