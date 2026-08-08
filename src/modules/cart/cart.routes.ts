import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { cartService } from './cart.service.js';
import { addItemSchema, applyCartCouponSchema, updateItemSchema } from './cart.schema.js';

export default async function cartRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async (req) => ok(await cartService.view(req.authUser!.id)));

  app.post('/items', async (req, reply) => {
    const input = validate(addItemSchema, req.body);
    return reply.status(201).send(ok(await cartService.addItem(req.authUser!.id, input)));
  });

  app.patch('/items/:itemId', async (req) => {
    const input = validate(updateItemSchema, req.body);
    const { itemId } = req.params as { itemId: string };
    return ok(await cartService.updateItem(req.authUser!.id, itemId, input));
  });

  app.delete('/items/:itemId', async (req) => {
    const { itemId } = req.params as { itemId: string };
    return ok(await cartService.removeItem(req.authUser!.id, itemId));
  });

  app.delete('/', async (req) => ok(await cartService.clear(req.authUser!.id)));

  app.post('/coupon', async (req) => {
    const input = validate(applyCartCouponSchema, req.body);
    return ok(await cartService.applyCoupon(req.authUser!.id, input.code));
  });
}
