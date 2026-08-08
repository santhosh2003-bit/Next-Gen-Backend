import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { couponsService } from './coupons.service.js';
import { applyCouponSchema, createCouponSchema, updateCouponSchema } from './coupons.schema.js';

export default async function couponsRoutes(app: FastifyInstance) {
  const guard = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('coupon:write')] };

  app.get('/', guard, async () => ok(await couponsService.list()));

  app.post('/', guard, async (req, reply) => {
    const input = validate(createCouponSchema, req.body);
    return reply.status(201).send(ok(await couponsService.create(input)));
  });

  app.patch('/:id', guard, async (req) => {
    const input = validate(updateCouponSchema, req.body);
    const { id } = req.params as { id: string };
    return ok(await couponsService.update(id, input));
  });

  app.delete('/:id', guard, async (req) => {
    const { id } = req.params as { id: string };
    return ok(await couponsService.remove(id));
  });

  // Validate a coupon against the authenticated user's cart subtotal.
  app.post('/validate', { onRequest: [app.authenticate] }, async (req) => {
    const input = validate(applyCouponSchema.extend({}), req.body);
    const { subtotal } = req.body as { subtotal?: number };
    return ok(await couponsService.evaluate(input.code, req.authUser!.id, Number(subtotal) || 0));
  });
}
