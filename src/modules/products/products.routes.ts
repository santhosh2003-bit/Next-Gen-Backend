import type { FastifyInstance } from 'fastify';
import { ok, paginated } from '../../common/response.js';
import { validate } from '../../common/validation.js';
import { productsService } from './products.service.js';
import { recordAudit } from '../../common/audit.js';
import {
  bulkCreateProductSchema,
  createProductSchema,
  listProductsQuery,
  productImageSchema,
  productVariantSchema,
  updateProductSchema,
} from './products.schema.js';

export default async function productsRoutes(app: FastifyInstance) {
  // Public storefront listing — only ACTIVE products.
  app.get('/', async (req) => {
    const query = validate(listProductsQuery, req.query);
    const { items, page, pageSize, total } = await productsService.list(query, { onlyActive: true });
    return paginated(items, page, pageSize, total);
  });

  app.get('/:slug', async (req) => {
    const { slug } = req.params as { slug: string };
    return ok(await productsService.getBySlug(slug));
  });

  const write = { onRequest: [app.authenticate], preHandler: [app.requirePermissions('product:write')] };

  // Admin listing — any status.
  app.get('/admin/all', write, async (req) => {
    const query = validate(listProductsQuery, req.query);
    const { items, page, pageSize, total } = await productsService.list(query);
    return paginated(items, page, pageSize, total);
  });

  app.post('/', write, async (req, reply) => {
    const input = validate(createProductSchema, req.body);
    const product = await productsService.create(input);
    await recordAudit({
      userId: req.authUser!.id, action: 'product.create', entity: 'product', entityId: product.id,
      metadata: { sku: product.sku, name: product.name }, ipAddress: req.ip,
    });
    return reply.status(201).send(ok(product));
  });

  // Bulk create — one request stores all rows (data + images) in the DB.
  app.post('/bulk', write, async (req, reply) => {
    const { items } = validate(bulkCreateProductSchema, req.body);
    const result = await productsService.createMany(items);
    await recordAudit({
      userId: req.authUser!.id, action: 'product.bulk_create', entity: 'product',
      metadata: { count: items.length, created: result.created, failed: result.failed }, ipAddress: req.ip,
    });
    return reply.status(201).send(ok(result));
  });

  app.patch('/:id', write, async (req) => {
    const input = validate(updateProductSchema, req.body);
    const { id } = req.params as { id: string };
    const product = await productsService.update(id, input);
    await recordAudit({ userId: req.authUser!.id, action: 'product.update', entity: 'product', entityId: id, metadata: { fields: Object.keys(input) }, ipAddress: req.ip });
    return ok(product);
  });

  app.delete('/:id', write, async (req) => {
    const { id } = req.params as { id: string };
    const result = await productsService.remove(id);
    await recordAudit({ userId: req.authUser!.id, action: 'product.archive', entity: 'product', entityId: id, ipAddress: req.ip });
    return ok(result);
  });

  // Images
  app.post('/:id/images', write, async (req, reply) => {
    const input = validate(productImageSchema, req.body);
    const { id } = req.params as { id: string };
    const image = await productsService.addImage(id, input);
    await recordAudit({ userId: req.authUser!.id, action: 'product.image.add', entity: 'product', entityId: id, metadata: { imageId: image.id }, ipAddress: req.ip });
    return reply.status(201).send(ok(image));
  });

  app.put('/:id/images/:imageId', write, async (req) => {
    const input = validate(productImageSchema, req.body);
    const { id, imageId } = req.params as { id: string; imageId: string };
    const image = await productsService.replaceImage(id, imageId, input);
    await recordAudit({ userId: req.authUser!.id, action: 'product.image.replace', entity: 'product', entityId: id, metadata: { imageId }, ipAddress: req.ip });
    return ok(image);
  });

  app.delete('/:id/images/:imageId', write, async (req) => {
    const { id, imageId } = req.params as { id: string; imageId: string };
    const result = await productsService.removeImage(id, imageId);
    await recordAudit({ userId: req.authUser!.id, action: 'product.image.remove', entity: 'product', entityId: id, metadata: { imageId }, ipAddress: req.ip });
    return ok(result);
  });

  // Variants
  app.post('/:id/variants', write, async (req, reply) => {
    const input = validate(productVariantSchema, req.body);
    const { id } = req.params as { id: string };
    return reply.status(201).send(ok(await productsService.addVariant(id, input)));
  });

  app.delete('/:id/variants/:variantId', write, async (req) => {
    const { id, variantId } = req.params as { id: string; variantId: string };
    return ok(await productsService.removeVariant(id, variantId));
  });
}
