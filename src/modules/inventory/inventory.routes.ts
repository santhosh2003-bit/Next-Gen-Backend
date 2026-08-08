import type { FastifyInstance } from 'fastify';
import { ok } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { inventoryService } from './inventory.service.js';
import { adjustStockSchema, createWarehouseSchema, upsertInventorySchema } from './inventory.schema.js';

export default async function inventoryRoutes(app: FastifyInstance) {
  const guard = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('inventory:write')] };
  const read = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('inventory:read')] };

  app.get('/warehouses', read, async () => ok(await inventoryService.listWarehouses()));

  app.post('/warehouses', guard, async (req, reply) => {
    const input = validate(createWarehouseSchema, req.body);
    return reply.status(201).send(ok(await inventoryService.createWarehouse(input)));
  });

  app.get('/product/:productId', read, async (req) => {
    const { productId } = req.params as { productId: string };
    return ok(await inventoryService.getForProduct(productId));
  });

  app.put('/', guard, async (req) => {
    const input = validate(upsertInventorySchema, req.body);
    return ok(await inventoryService.upsert(input));
  });

  app.post('/adjust', guard, async (req) => {
    const input = validate(adjustStockSchema, req.body);
    return ok(await inventoryService.adjust(input));
  });

  app.get('/low-stock', read, async () => ok(await inventoryService.lowStock()));
}
